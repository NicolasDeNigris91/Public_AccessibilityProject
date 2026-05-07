---
"backend": patch
"frontend": patch
---

Override `postcss` and `tmp` to patched versions across the workspace,
closing two open Dependabot vulnerability alerts on the public mirror's
Security tab.

- `postcss` → `^8.5.14` — closes GHSA-qx2v-qp2m-jg93 (medium): XSS via
  unescaped `</style>` in CSS Stringify Output. Reaches the bundle via
  `next` (both `frontend/next@15.x` and the storybook-vite `next@16.x`)
  which had not yet bumped their bundled postcss.
- `tmp` → `^0.2.5` — closes GHSA-52f5-9888-hmc6 (low): symlink attack
  on the `dir` parameter. Reaches dev tooling via the
  `@stryker-mutator → @inquirer/editor → external-editor` chain.

Both fixes via the existing `overrides` block (alongside the prior
`basic-ftp` pin) rather than a `npm audit fix --force`, which would
downgrade `next` to `9.3.3` and `@stryker-mutator/core` to a breaking
major. Parents stay on their current versions; only the resolved
transitive is forced up.

After this change, `npm audit` no longer reports the postcss / tmp
findings. Backend build and tests pass against the new lockfile.
