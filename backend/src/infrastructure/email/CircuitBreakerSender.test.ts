import { CircuitBreakerSender, CircuitOpenError } from "./CircuitBreakerSender";
import { authEmailCircuitBreakerEventsTotal } from "@/infrastructure/metrics/registry";
import { logger } from "@/config/logger";
import type { EmailSender, MagicLinkMail } from "./EmailSender";

class FlakyInner implements EmailSender {
  public calls = 0;
  constructor(private readonly outcomes: Array<"ok" | Error>) {}
  async sendMagicLink(_mail: MagicLinkMail): Promise<void> {
    const outcome = this.outcomes[this.calls];
    this.calls += 1;
    if (!outcome) throw new Error("test ran past configured outcomes");
    if (outcome === "ok") return;
    throw outcome;
  }
}

const MAIL: MagicLinkMail = { to: "a@b.com", link: "https://x/verify?token=t" };

describe("CircuitBreakerSender", () => {
  let nowMs: number;
  const advance = (ms: number): void => {
    nowMs += ms;
  };
  const now = (): number => nowMs;

  beforeEach(() => {
    nowMs = 1_000_000;
    authEmailCircuitBreakerEventsTotal.reset();
    jest.spyOn(logger, "warn").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function readEvent(event: string): Promise<number> {
    const data = await authEmailCircuitBreakerEventsTotal.get();
    const match = data.values.find((v) => {
      const labels = v.labels as Record<string, string | number>;
      return labels.event === event;
    });
    return match?.value ?? 0;
  }

  describe("closed state", () => {
    it("passes through successful sends transparently", async () => {
      const inner = new FlakyInner(["ok", "ok"]);
      const cb = new CircuitBreakerSender(inner, { failureThreshold: 3, cooldownMs: 30_000, now });
      await cb.sendMagicLink(MAIL);
      await cb.sendMagicLink(MAIL);
      expect(inner.calls).toBe(2);
      expect(cb.currentState).toBe("closed");
    });

    it("propagates the inner error and stays closed below the threshold", async () => {
      const boom = new Error("smtp down");
      const inner = new FlakyInner([boom, boom]);
      const cb = new CircuitBreakerSender(inner, { failureThreshold: 3, cooldownMs: 30_000, now });
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      expect(cb.currentState).toBe("closed");
    });

    it("resets the consecutive-failure counter on any success", async () => {
      const boom = new Error("smtp down");
      const inner = new FlakyInner([boom, boom, "ok", boom, boom]);
      const cb = new CircuitBreakerSender(inner, { failureThreshold: 3, cooldownMs: 30_000, now });
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await cb.sendMagicLink(MAIL); // reset
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      // Two consecutive failures after reset is below the threshold of 3.
      expect(cb.currentState).toBe("closed");
    });
  });

  describe("transition closed -> open", () => {
    it("opens the circuit after exactly failureThreshold consecutive failures", async () => {
      const boom = new Error("smtp down");
      const inner = new FlakyInner([boom, boom, boom]);
      const cb = new CircuitBreakerSender(inner, { failureThreshold: 3, cooldownMs: 30_000, now });
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      expect(cb.currentState).toBe("open");
      expect(await readEvent("open")).toBe(1);
    });
  });

  describe("open state", () => {
    async function tripToOpen(threshold = 2): Promise<{
      cb: CircuitBreakerSender;
      inner: FlakyInner;
    }> {
      const boom = new Error("smtp down");
      const inner = new FlakyInner([boom, boom, "ok", "ok", "ok"]);
      const cb = new CircuitBreakerSender(inner, {
        failureThreshold: threshold,
        cooldownMs: 30_000,
        now,
      });
      for (let i = 0; i < threshold; i += 1) {
        await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      }
      expect(cb.currentState).toBe("open");
      return { cb, inner };
    }

    it("fails fast with CircuitOpenError without calling the inner sender during cooldown", async () => {
      const { cb, inner } = await tripToOpen();
      const callsBefore = inner.calls;
      await expect(cb.sendMagicLink(MAIL)).rejects.toBeInstanceOf(CircuitOpenError);
      expect(inner.calls).toBe(callsBefore);
      expect(await readEvent("rejected")).toBe(1);
    });

    it("records every rejected call (one event per attempt during cooldown)", async () => {
      const { cb } = await tripToOpen();
      await expect(cb.sendMagicLink(MAIL)).rejects.toBeInstanceOf(CircuitOpenError);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBeInstanceOf(CircuitOpenError);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBeInstanceOf(CircuitOpenError);
      expect(await readEvent("rejected")).toBe(3);
    });

    it("transitions to half_open after the cooldown elapses and a new send arrives", async () => {
      const { cb, inner } = await tripToOpen();
      const callsBefore = inner.calls;
      advance(30_000);
      await cb.sendMagicLink(MAIL); // half-open probe, succeeds → closed
      expect(inner.calls).toBe(callsBefore + 1);
      expect(cb.currentState).toBe("closed");
      expect(await readEvent("half_open")).toBe(1);
      expect(await readEvent("closed")).toBe(1);
    });
  });

  describe("half_open state", () => {
    async function tripAndProbe(probe: "ok" | Error): Promise<{
      cb: CircuitBreakerSender;
      inner: FlakyInner;
    }> {
      const boom = new Error("smtp down");
      const outcomes: Array<"ok" | Error> = [boom, boom, probe, "ok"];
      const inner = new FlakyInner(outcomes);
      const cb = new CircuitBreakerSender(inner, {
        failureThreshold: 2,
        cooldownMs: 30_000,
        now,
      });
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      advance(30_000);
      return { cb, inner };
    }

    it("closes the circuit on a successful probe", async () => {
      const { cb } = await tripAndProbe("ok");
      await cb.sendMagicLink(MAIL);
      expect(cb.currentState).toBe("closed");
    });

    it("re-opens the circuit on a failed probe and resets the cooldown clock", async () => {
      const probeErr = new Error("still down");
      const { cb } = await tripAndProbe(probeErr);
      const beforeReopen = nowMs;
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(probeErr);
      expect(cb.currentState).toBe("open");
      // Cooldown clock restarted at the failed probe time, not the
      // original open time, so a call 1ms later still rejects.
      advance(1);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBeInstanceOf(CircuitOpenError);
      // ...and a call after a full cooldown from the *new* opened-at probes again.
      advance(30_000);
      void beforeReopen; // ensures the test is anchored to the re-open moment
      await cb.sendMagicLink(MAIL);
      expect(cb.currentState).toBe("closed");
    });
  });

  describe("observability", () => {
    it("logs every state transition with from/to/threshold", async () => {
      const warnSpy = jest.spyOn(logger, "warn");
      const boom = new Error("smtp down");
      const inner = new FlakyInner([boom, boom, "ok"]);
      const cb = new CircuitBreakerSender(inner, { failureThreshold: 2, cooldownMs: 100, now });
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      await expect(cb.sendMagicLink(MAIL)).rejects.toBe(boom);
      advance(100);
      await cb.sendMagicLink(MAIL);

      const calls = warnSpy.mock.calls.map((c) => c[0] as Record<string, unknown>);
      const transitions = calls
        .filter((c) => c.event === "auth.email_circuit")
        .map((c) => `${c.from as string}->${c.to as string}`);
      expect(transitions).toEqual(["closed->open", "open->half_open", "half_open->closed"]);
    });
  });
});
