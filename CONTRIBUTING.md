# Contributing

Contributions that move this project forward:

- **Audit-engine improvements.** Better axe-core rule coverage, additional
  Puppeteer instrumentation, smarter retry / timeout handling.
- **Dashboard improvements.** History views, color-blindness simulator
  fidelity, comparison views, accessibility score breakdowns.
- **Reliability.** Queue back-pressure, idempotent persistence, better
  observability around stalled jobs.
- **Bug fixes.** Anything diverging from the documented behavior.

If you are reporting a security issue, do **not** open a public PR or issue;
follow [SECURITY.md](./SECURITY.md). Note that this project deliberately
runs untrusted URLs in a headless browser, which makes the threat model
worth reading first.

## Local environment

Prerequisites:

- Node.js 20+
- Docker + Docker Compose v2

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: <http://localhost:3000>
- API:      <http://localhost:4000>
- Swagger:  <http://localhost:4000/docs>

For unit tests without docker:

```bash
npm ci
npm test --workspace backend
npm test --workspace frontend
```

## Test bar

| Change touches            | Required                                                        |
| ------------------------- | --------------------------------------------------------------- |
| `backend/`                | `npx tsc --noEmit` + `npm test --workspace backend`             |
| `frontend/`               | `npx tsc --noEmit` + `npm test --workspace frontend` + `build`  |
| Worker / Puppeteer / axe  | The above + a manual end-to-end audit through the dashboard     |
| docker-compose / deploy   | `docker compose up --build` boots clean and the e2e flow works  |

CI runs the same matrix on every PR.

## Style

- TypeScript: strict mode, `tsc --noEmit` clean. No `any`.
- Backend: Express handlers thin, business logic in services / queue.
  Mongoose models in `backend/src/models/`. Pino structured logs only -
  no `console.log`.
- Worker: never share Puppeteer browser instances across jobs; spin up
  per job and close on completion.
- Frontend: Next.js App Router. Server components by default; mark client
  components explicitly with `'use client'`.
- Commits: conventional commits (`type(scope): summary`), lower-case,
  imperative mood. Match the existing log style. No AI-attribution
  trailers.

## License

By submitting a PR, you agree that your contribution is licensed under the
[MIT License](./LICENSE) of this project.
