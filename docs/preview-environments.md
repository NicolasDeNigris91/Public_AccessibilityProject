# Preview environments

Every PR opened against `main` gets its own throwaway Railway
environment so a reviewer can click a URL instead of pulling the
branch and running the stack locally.

## How it works

`.github/workflows/preview-env.yml` runs on each `pull_request` event:

| Event                    | Action                                                   |
| ------------------------ | -------------------------------------------------------- |
| `opened` / `reopened`    | Create env `pr-<number>`, deploy the branch, comment URL |
| `synchronize`            | Re-deploy the same env (push to PR)                      |
| `closed` (merged or not) | Delete the env, comment teardown                         |

Each env is cloned from the `RAILWAY_BASE_ENVIRONMENT` (defaults to
`production`) so the PR sees realistic env vars and service topology.

## One-time setup

The workflow is **self-skipping** when secrets aren't configured —
forks and fresh clones won't error out. To enable previews on the
canonical repo:

1. **Generate a Railway API token.**
   Railway dashboard → Account → Tokens → "Create Token". Scope: full
   project access. Copy the token (it's shown once).
2. **Find the project ID.**
   Project → Settings → "Project ID" (UUID).
3. **Add three secrets to the GitHub repo.**
   GitHub → Settings → Secrets and variables → Actions → "New
   repository secret":
   - `RAILWAY_TOKEN` — the token from step 1.
   - `RAILWAY_PROJECT_ID` — the UUID from step 2.
   - `RAILWAY_BASE_ENVIRONMENT` — optional; default `production`.

The next PR opened triggers a deploy. The action posts a comment with
the URL when the deploy succeeds.

## Operational notes

- The free tier on Railway has resource caps. With 5 services per env
  (api, worker, frontend, mongo, redis) and one env per open PR,
  expect to keep at most 2-3 active PRs at once before hitting limits.
  If you do, close older PRs or pause the action.
- Database **state is per-env** (Mongo and Redis are cloned at env
  creation). Tests that mutate Mongo only affect that PR's environment.
- The `audits-dead` queue and Bull-Board admin (`/admin/queues`) are
  available in each preview env — basic-auth credentials must be set
  in the env's settings (or inherited from the base) for the route to
  mount. See [docs/runbooks/dlq-replay.md](./runbooks/dlq-replay.md).

## When this isn't enough

For a long-lived feature branch where five PRs come and go but the
env should persist, create a manual Railway env with a stable name
(e.g. `staging-search`) instead of relying on the auto-created
`pr-<number>` ones. The workflow only manages the `pr-*` envs.
