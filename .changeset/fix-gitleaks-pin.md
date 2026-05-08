---
---

CI hygiene: pin `gitleaks/gitleaks-action @v2` by **commit SHA** (`ff98106e…`) instead of the **annotated-tag object** SHA (`dcedce43…`) that PR #22 had used. Scorecard's Pinned-Dependencies imposter-commit check rejects tag-object SHAs because they aren't commits. Pure CI metadata; no runtime impact.
