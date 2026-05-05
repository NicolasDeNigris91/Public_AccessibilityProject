---
"backend": minor
"frontend": minor
---

Phase 4.1 — close the three known WCAG 2.2 AA gaps tracked in
`docs/A11Y-AUDIT.md`:

- **3.3.1 / 3.3.3 Error Identification & Suggestion**: the dashboard
  form on `/app` and the reaudit button on `/audits/[id]` now surface a
  `role="alert"` block with a pt-BR message mapped from the backend
  error envelope (`postJson` + `errorMessages.ts`). 429 and network
  errors get specific copy too.
- **4.1.3 Status Messages**: `StatusShell` wraps title + url + hint in a
  `role="status"` + `aria-live="polite"` + `aria-atomic="true"` region,
  so the `queued → running → done|failed` transitions the SWR poll
  drives are announced to screen readers without navigating away.
- **2.4.2 Page Titled**: `app/audits/[id]/page.tsx` is now a Server
  Component that exports `generateMetadata`. The metadata fetches the
  audit URL server-side (3 s timeout, 30 s revalidate) and renders
  `Auditoria de <host> — Euthus`, falling back to a generic title on
  miss / error. The client-side rendering moved to `AuditDetailView`.
