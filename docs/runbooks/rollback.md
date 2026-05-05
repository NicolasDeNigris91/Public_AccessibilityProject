# Runbook: rollback a bad release

A merge to `main` reached production and is causing a measurable user
impact (5xx spike, audit failure-rate breach, frontend regressing).

## Decision tree

1. **Is the symptom a Mongo schema migration?** → see _Mongo migration_
   below. Schema rollbacks need data care; pure code rollbacks don't.
2. **Is it the worker, the api, or the frontend?** Roll back only that
   service to keep blast radius small.
3. **Was it a Chromium / puppeteer-image change?** Roll back that
   service first; api/frontend rarely interact with that change.

## Code rollback (Railway)

1. **Pin the previous tag.** `git log --tags --simple-decoration -10`
   to find the last known-good `vX.Y.Z`.
2. In Railway: open the affected service → Deployments → find the
   build matching the previous tag → "Redeploy". Done in ≈ 90 s.
3. If you don't trust the tag, redeploy the commit on `main` that's
   one before the bad merge: `git checkout <sha>` and trigger Railway
   from there.
4. After deploy: hit `/health`, `/ready`, `/metrics` — confirm the
   regressed metric returns to baseline.

## Frontend rollback

Same as above, but a fresh user is the test: load the live URL in an
incognito window with cache off and run the smoke flow.

## Mongo migration rollback

If the bad change includes a forward migration that **only added
fields/indexes**, no rollback is required — old code ignores them.

If it **renamed**, **dropped**, or **changed the type of** a field:

1. Take a snapshot of the affected collection BEFORE rolling back
   code:
   `mongodump --uri="$MONGO_URI" --collection=audits --out=backup-$(date +%F)/`
2. Roll back the code.
3. Run the inverse migration (or restore from the snapshot if no
   inverse exists).
4. Postmortem must include why a destructive migration shipped without
   a same-PR rollback script.

## Communication

- Update the status page (or pinned issue) within 5 min of identifying
  the regression.
- After rollback, send a one-paragraph "what we shipped, what broke,
  what we did" note before the postmortem. Don't wait for the
  postmortem.

## Follow-up

- Add a regression test for the failure mode.
- If rollback took longer than 5 min, ticket the friction.
- File the postmortem within 48 h.
