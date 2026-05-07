---
---

Workflow + repo hygiene to close 14 open CodeQL alerts on the public mirror's Security tab. Pure CI / repo metadata; no runtime impact on either workspace.

- 7× `actions/missing-workflow-permissions` (medium): added top-level `permissions: contents: read` to `ci.yml`, `e2e.yml`, `lighthouse.yml`, `mutation.yml`, `storybook.yml`. Workflows that need write (release, supply-chain, preview-env, security) already declare per-job permissions; left untouched.
- 6× `actions/unpinned-tag` (medium): pinned 3rd-party actions by commit SHA with the floating tag preserved as a trailing comment so Dependabot can still update:
  - `peter-evans/create-or-update-comment@v4` → `@71345be0…` (×2 in `preview-env.yml`)
  - `anchore/sbom-action@v0` → `@e22c3899…` (`supply-chain.yml`)
  - `gitleaks/gitleaks-action@v2` → `@dcedce43…` (`security.yml`)
  - `google/osv-scanner-action/osv-scanner-action@v2.0.1` → `@6fc71445…` (`security.yml`)
  - `changesets/action@v1` → `@63a615b9…` (`release.yml`)
- 1× `js/unused-local-variable` (note): removed unused `ReauditAlert` import in `frontend/src/app/audits/[id]/StatusShell.stories.tsx`.
