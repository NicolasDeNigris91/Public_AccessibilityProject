# ADR 0001 — Clean architecture layering

- **Status:** Accepted
- **Date:** 2026-04-15
- **Decision-maker:** Nicolas

## Context

Euthus runs a non-trivial pipeline: HTTP → BullMQ → Puppeteer →
axe-core → Mongo. Without discipline this graph turns into a single
file that cannot be unit-tested without booting half a stack.

Two extremes were on the table:

1. **Single-folder Express app.** Everything in `src/`, route handlers
   call Mongoose / Puppeteer directly. Fast to write, hard to refactor.
2. **Strict hexagonal / clean-arch.** `domain/`, `application/`,
   `infrastructure/`, `interfaces/`. Slower up front, but pure logic
   stays pure.

## Decision

We adopt option 2 with four layers:

- `domain/` — pure types, scoring, URL classification, axe-result
  reshaping, response contracts (zod). No I/O. Unit-testable in
  microseconds.
- `application/` — use cases that compose domain + I/O ports.
  `assertSafeUrl`, `resolveSafeAddress`, `subrequestPolicy`. I/O is
  injected (DNS resolver), not imported.
- `infrastructure/` — concrete adapters: Mongo connection, BullMQ queue,
  Redis connection, Prometheus registry, queue-depth sampler.
- `interfaces/http/` — Express routers, middlewares, swagger glue.
  Thin: parse → call application → respond.

## Consequences

- Swapping Puppeteer → Playwright or BullMQ → SQS is one folder, not
  one rewrite.
- Mutation testing (Stryker) targets `domain/` and gives a meaningful
  90%+ score because the layer is pure.
- Cost: more files. The codebase has more boilerplate than a single-
  folder Express app would. We accept that — the tests run in 5
  seconds and make the code refactorable.
