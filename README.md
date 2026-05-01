# Web Accessibility Auditing Tool

[![CI](https://github.com/NicolasDeNigris91/Public_AccessibilityProject/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NicolasDeNigris91/Public_AccessibilityProject/actions/workflows/ci.yml)
[![CodeQL](https://github.com/NicolasDeNigris91/Public_AccessibilityProject/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/NicolasDeNigris91/Public_AccessibilityProject/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

WCAG auditor. Submit a URL, a background worker runs Puppeteer + axe-core, the result is persisted, and the dashboard renders score, history, and a color-blindness simulator.

**Live:** [accessibility.nicolaspilegidenigris.dev](https://accessibility.nicolaspilegidenigris.dev)

## Architecture

Monorepo with clean separation of concerns:

- **`/backend`**: Node.js + TypeScript + Express. Two processes from the same image:
  - `api`: REST + Swagger, enqueues audit jobs
  - `worker`: BullMQ consumer, runs Puppeteer + axe-core
- **`/frontend`**: Next.js 14 dashboard
- **MongoDB**: audit persistence (via Mongoose)
- **Redis**: BullMQ queue backend

Workers and HTTP API are intentionally separate processes sharing the same image. The API never launches Puppeteer in-process, which keeps the request lifecycle fast and lets the worker be scaled independently.

## Local Development

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: <http://localhost:3000>
- API:      <http://localhost:4000>
- Swagger:  <http://localhost:4000/docs>
- Health:   <http://localhost:4000/health>

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design and [docs/ROADMAP.md](docs/ROADMAP.md) for the incremental build plan.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 20, Next.js 14, React 18 |
| Language | TypeScript (strict) |
| Framework | Express 4, Mongoose 8 |
| Queue | BullMQ + Redis 7 |
| Engine | Puppeteer 23, axe-core 4 |
| DB | MongoDB 7 |
| Docs | Swagger / OpenAPI |
| Logging | Pino (structured JSON) |
| Tests | Jest + Supertest |
| Container | Docker + docker-compose |

## Deploy (Railway)

Five services in one Railway project:

| Service | Source | Notes |
|---|---|---|
| `api` | `backend/Dockerfile`, `ROLE=api` | exposes HTTP, custom domain |
| `worker` | `backend/Dockerfile.worker` | queue consumer, Puppeteer |
| `frontend` | `frontend/Dockerfile` | Next.js 14 dashboard |
| `mongo` | Railway MongoDB plugin | auto-provisions `MONGO_URL` |
| `redis` | Railway Redis plugin | auto-provisions `REDIS_URL` |

Required environment variables per service. See [.env.example](.env.example) for the full list.
