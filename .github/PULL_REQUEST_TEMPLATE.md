<!-- Keep the description tight - reviewer should be able to predict the diff. -->

## What

<!-- One paragraph: what this PR changes and why. -->

## Component

- [ ] api (Express + Swagger)
- [ ] worker (BullMQ + Puppeteer + axe-core)
- [ ] frontend (Next.js dashboard)
- [ ] persistence / queue (mongo, redis)
- [ ] docker / deploy
- [ ] tooling / CI / docs

## Verification

- [ ] `npm test --workspace backend` passes
- [ ] `npm test --workspace frontend` passes
- [ ] `npx tsc --noEmit` passes in both workspaces
- [ ] `npm run build --workspace frontend` succeeds
- [ ] `docker compose up --build` boots clean (if compose touched)
- [ ] End-to-end: submit a URL, audit completes, dashboard renders score

## Compatibility

<!-- Anything an operator upgrading needs to know: mongo schema/index
changes, queue payload changes, env var renames, breaking API changes.
"None" is a valid answer. -->

## Related

Closes #
