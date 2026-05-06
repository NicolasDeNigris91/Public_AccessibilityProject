import type { EmailSender, MagicLinkMail } from "./EmailSender";
import { logger } from "@/config/logger";
import { authEmailCircuitBreakerEventsTotal } from "@/infrastructure/metrics/registry";

type State = "closed" | "open" | "half_open";

interface Opts {
  failureThreshold: number;
  cooldownMs: number;
  /** Injectable for tests; defaults to Date.now. */
  now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor() {
    super("email_circuit_open");
    this.name = "CircuitOpenError";
  }
}

/**
 * Three-state circuit breaker for the outbound email surface. Closes
 * over any EmailSender; the breaker only inspects the result of
 * sendMagicLink, never the email content. State transitions are
 * recorded both as a structured pino log and as the
 * `auth_email_circuit_events_total{event}` Prometheus counter so
 * on-call can spot a degraded provider before users do.
 *
 * Why not just retry: piling on a failing provider during an outage
 * makes recovery slower and costs us quota. The breaker fails fast
 * after `failureThreshold` consecutive errors, sleeps `cooldownMs`,
 * then probes with a single half-open call. A success closes the
 * circuit; another failure re-opens it with a fresh cooldown.
 */
export class CircuitBreakerSender implements EmailSender {
  private state: State = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly now: () => number;

  constructor(
    private readonly inner: EmailSender,
    private readonly opts: Opts
  ) {
    this.now = opts.now ?? Date.now;
  }

  /** Test introspection only; do not branch production code on this. */
  get currentState(): State {
    return this.state;
  }

  async sendMagicLink(mail: MagicLinkMail): Promise<void> {
    if (this.state === "open") {
      if (this.now() - this.openedAt < this.opts.cooldownMs) {
        authEmailCircuitBreakerEventsTotal.inc({ event: "rejected" });
        throw new CircuitOpenError();
      }
      this.transition("half_open");
    }

    try {
      await this.inner.sendMagicLink(mail);
    } catch (err) {
      this.consecutiveFailures += 1;
      if (this.state === "half_open" || this.consecutiveFailures >= this.opts.failureThreshold) {
        this.transition("open");
      }
      throw err;
    }

    // Success path: half-open probe recovered, or we were already closed.
    if (this.state === "half_open") {
      this.transition("closed");
    }
    this.consecutiveFailures = 0;
  }

  private transition(next: State): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    if (next === "open") {
      this.openedAt = this.now();
    }
    if (next === "closed") {
      this.consecutiveFailures = 0;
    }
    authEmailCircuitBreakerEventsTotal.inc({ event: next });
    logger.warn(
      {
        event: "auth.email_circuit",
        from: prev,
        to: next,
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.opts.failureThreshold,
      },
      "email_circuit_transition"
    );
  }
}
