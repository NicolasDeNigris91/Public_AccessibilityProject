# Migrations

Versioned MongoDB schema/index changes, applied with [migrate-mongo].

```bash
npm --workspace backend run migrate:status   # what's applied / pending
npm --workspace backend run migrate:up       # apply pending migrations
npm --workspace backend run migrate:down     # roll back the last one
```

[migrate-mongo]: https://github.com/seppevs/migrate-mongo

## Authoring

Filename pattern: `YYYYMMDDHHMM-short-name.js` (date prefix sorts naturally).
Each file exports `up(db, client)` and `down(db, client)` async functions.

Rules:

- Every `up` must be idempotent. Use `createIndex` (no-op if same spec)
  and `updateMany` with explicit filters that exclude already-migrated
  documents.
- Every `up` must have a corresponding `down`, even if the `down` is "no
  data action, just drop the new index". A migration that cannot be
  rolled back must say so in a comment and be reviewed extra carefully.
- Never edit a migration after it has been merged to `main`. Write a new
  one that fixes the prior one.

## Operational order

The runtime no longer relies on `Mongoose.syncIndexes()` at boot for
production. Migrations run before a release reaches the api / worker.
On Railway, this is wired into the api service's build/start (see
deploy notes in `docs/runbooks/rollback.md`).
