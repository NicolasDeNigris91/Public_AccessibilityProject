# Euthus — frontend

Next.js 14 (App Router) + TypeScript strict + Tailwind. The frontend is a
workspace within the monorepo at the repo root; run all commands from
the repo root unless noted.

## Common scripts

| Command                                     | What it does                            |
| ------------------------------------------- | --------------------------------------- |
| `npm run dev:frontend`                      | Start the Next dev server on port 3000  |
| `npx jest --coverage` (in `frontend/`)      | Unit tests with the 75/50 coverage gate |
| `npm run lint --workspace frontend`         | ESLint with `--max-warnings=0`          |
| `npm run build --workspace frontend`        | Production Next build                   |
| `npm run bundle:check --workspace frontend` | Enforce per-route gzipped JS budget     |
| `npm run e2e --workspace frontend`          | Playwright + axe end-to-end suite       |

## Storybook

Component playground for the design system. Storybook 10 with the
`@storybook/nextjs-vite` framework — uses Vite under the hood (faster
cold starts, cleaner monorepo resolution than the webpack5 builder).

```bash
npm run storybook --workspace frontend          # dev, http://localhost:6006
npm run build-storybook --workspace frontend    # static build → frontend/storybook-static/
```

### What's covered

| Component                  | Stories                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `ui/Button`                | Variants (primary, secondary, ghost, link), sizes, disabled |
| `ui/Badge`                 | All severities + neutral + side-by-side comparison          |
| `ui/Logo`                  | All variants (mark, lockup, stacked) + size scale           |
| `report/ScoreDisplay`      | High/moderate/low score tones                               |
| `report/ReportHeader`      | With/without date, with/without re-audit action, long URLs  |
| `report/SeverityBreakdown` | Mixed totals, empty, critical-only, heavy load              |
| `report/ViolationCard`     | Each severity, no help link, many affected nodes            |
| `audits/[id]/StatusShell`  | Queued, running, failed, not-found, with re-audit alert     |
| `audits/[id]/ReauditAlert` | Default, error wording, long message                        |

Stories live next to the component they cover (`Component.stories.tsx`).
They are excluded from Jest coverage via `collectCoverageFrom`.

### Accessibility

`@storybook/addon-a11y` runs axe per story against `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa` tags. The bar is **zero serious or critical
violations** in the addon panel for every published story. Findings
panel: bottom of the Storybook UI when a story is open.

Visual regression (snapshot diffs of stories) is not gated yet — that
arrives in a separate phase using a pinned Playwright/Chromatic
baseline so Windows-vs-Linux pixel drift does not cause false
positives.

### Where Storybook lives

- `.storybook/main.ts` — framework + addons
- `.storybook/preview.tsx` — global decorators (Tailwind theme toggle,
  `next/font` loaders, axe rules)
- Storybook tooling (`storybook`, `@storybook/nextjs-vite`,
  `@storybook/addon-a11y`, `vite`) is declared in the **repo-root**
  `package.json` rather than `frontend/`. This is intentional — the
  Storybook CLI is hoisted to root by npm and needs to resolve its
  framework package from the same `node_modules` tree, which only
  works when both sit at root.
