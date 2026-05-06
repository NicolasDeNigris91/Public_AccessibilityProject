import pino from "pino";
import { ConsoleSender } from "./consoleSender";

describe("ConsoleSender", () => {
  it("logs the magic link at info level", async () => {
    const writes: string[] = [];
    const logger = pino({ level: "debug" }, { write: (m: string) => writes.push(m) });
    const s = new ConsoleSender(logger);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      await s.sendMagicLink({ to: "a@b.com", link: "https://x/verify?token=abc" });
    } finally {
      process.env.NODE_ENV = prev;
    }
    const parsed = writes.map((w) => JSON.parse(w));
    expect(parsed[0]).toMatchObject({
      level: 30,
      msg: expect.stringContaining("magic link issued"),
      to: "a@b.com",
      link: "https://x/verify?token=abc",
    });
  });

  it("is a no-op when NODE_ENV=test", async () => {
    const writes: string[] = [];
    const logger = pino({ level: "debug" }, { write: (m: string) => writes.push(m) });
    const s = new ConsoleSender(logger);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      await s.sendMagicLink({ to: "a@b.com", link: "https://x" });
      expect(writes).toEqual([]);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
