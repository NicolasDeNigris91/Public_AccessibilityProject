# Euthus — WCAG 2.2 self-audit

> **Target:** WCAG 2.2 Level AA. AAA is aspirational where reasonable
> (contrast, focus visibility) but not promised.
> **Last manual review:** 2026-05-04
> **Methods:** axe-core/playwright in CI (a11y.spec.ts) plus manual
> keyboard + screen-reader walkthrough on `/`, `/aprender`, `/app`,
> `/audits/[id]`.

axe alone catches roughly a third of WCAG criteria. The list below is the
manual side: each row is a 2.2 success criterion with a one-line status.
Status legend:

- ✅ — passes, automated test in place where possible
- ⚠️ — passes today but no automated test; manual review re-needed on
  every UI change
- ❌ — known gap, see "Known gaps" at the bottom
- N/A — does not apply to this app's surface

The full WCAG criteria list is at <https://www.w3.org/TR/WCAG22/>.

## Perceivable

| SC     | Title                     | Level | Status | Notes                                                                                                                                           |
| ------ | ------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1  | Non-text Content          | A     | ⚠️     | All current images are decorative. Logo has accessible name via SVG `<title>`.                                                                  |
| 1.2.\* | Time-based Media          | A/AA  | N/A    | No audio or video.                                                                                                                              |
| 1.3.1  | Info and Relationships    | A     | ✅     | Semantic HTML (`<header>`, `<main>`, `<table>`, `<h1>` per page). axe rule `region` passes.                                                     |
| 1.3.2  | Meaningful Sequence       | A     | ✅     | DOM order matches visual order (no abs-positioned content).                                                                                     |
| 1.3.3  | Sensory Characteristics   | A     | ✅     | No instructions rely on shape / color / position alone.                                                                                         |
| 1.3.4  | Orientation               | AA    | ✅     | Layout is not orientation-locked.                                                                                                               |
| 1.3.5  | Identify Input Purpose    | AA    | ✅     | Single URL input has `type="url"` and `aria-label="URL"`.                                                                                       |
| 1.4.1  | Use of Color              | A     | ⚠️     | Severity badges use color + text label, but the failed-audit row in the dashboard distinguishes by both badge color and the word "Falhou".      |
| 1.4.2  | Audio Control             | A     | N/A    | No audio.                                                                                                                                       |
| 1.4.3  | Contrast (Minimum) 4.5:1  | AA    | ⚠️     | Theme tokens designed against AA. Manual spot-checks pass; no automated contrast test yet (axe rule covers the main cases). To be lifted to ✅. |
| 1.4.4  | Resize text               | AA    | ✅     | Tested at 200% browser zoom, no horizontal scroll on the dashboard. Tailwind `prose` and `max-w-prose` keep line length sane.                   |
| 1.4.5  | Images of Text            | AA    | ✅     | None used.                                                                                                                                      |
| 1.4.10 | Reflow                    | AA    | ✅     | At 320 CSS px width, no horizontal scroll on `/`, `/aprender`, `/app`. Audit detail wraps long URLs with `break-all`.                           |
| 1.4.11 | Non-text Contrast 3:1     | AA    | ⚠️     | Buttons + badges checked manually. Will encode as a Playwright + axe contrast assertion.                                                        |
| 1.4.12 | Text Spacing              | AA    | ✅     | Verified with the Stylebot text-spacing bookmarklet — nothing clips.                                                                            |
| 1.4.13 | Content on Hover or Focus | AA    | ✅     | No hover-revealed interactive content.                                                                                                          |

## Operable

| SC     | Title                            | Level | Status | Notes                                                                                                                         |
| ------ | -------------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 2.1.1  | Keyboard                         | A     | ✅     | All controls reachable + operable with keyboard only. Smoke spec asserts SkipLink visible after first Tab.                    |
| 2.1.2  | No Keyboard Trap                 | A     | ✅     | No focus traps. Audit detail page moves focus to the heading on navigation but `tabIndex={-1}` doesn't trap subsequent Tabs.  |
| 2.1.4  | Character Key Shortcuts          | A     | N/A    | No single-character shortcuts.                                                                                                |
| 2.2.1  | Timing Adjustable                | A     | N/A    | No timeouts on user input.                                                                                                    |
| 2.2.2  | Pause, Stop, Hide                | A     | N/A    | No moving / blinking / auto-updating content beyond the 3 s SWR poll, which is silent and stops once the audit is `done`.     |
| 2.3.1  | Three Flashes or Below Threshold | A     | ✅     | No flashing content.                                                                                                          |
| 2.4.1  | Bypass Blocks                    | A     | ✅     | `<SkipLink />` to main content; visible on focus.                                                                             |
| 2.4.2  | Page Titled                      | A     | ✅     | `<title>` set globally; per-page titles to be added when the audit detail moves to server-rendered metadata (follow-up).      |
| 2.4.3  | Focus Order                      | A     | ✅     | DOM order matches reading order; no `tabIndex > 0`.                                                                           |
| 2.4.4  | Link Purpose (In Context)        | A     | ✅     | "Como corrigir →" + violation description gives full context. Audit row links use the URL text as the accessible name.        |
| 2.4.5  | Multiple Ways                    | AA    | ⚠️     | Site has 4 routes; nav lists the dashboard. No site-search yet (acceptable at this size).                                     |
| 2.4.6  | Headings and Labels              | AA    | ✅     | Each section has a heading; form input labelled.                                                                              |
| 2.4.7  | Focus Visible                    | AA    | ✅     | Default browser ring preserved; not removed by Tailwind reset.                                                                |
| 2.4.11 | Focus Not Obscured (Minimum)     | AA    | ✅     | No fixed banners covering focus targets.                                                                                      |
| 2.5.1  | Pointer Gestures                 | A     | N/A    | No path-based gestures.                                                                                                       |
| 2.5.2  | Pointer Cancellation             | A     | ✅     | Click handlers fire on `up`, not `down`.                                                                                      |
| 2.5.3  | Label in Name                    | A     | ✅     | Visible button text matches the accessible name.                                                                              |
| 2.5.4  | Motion Actuation                 | A     | N/A    | No motion-driven UI.                                                                                                          |
| 2.5.7  | Dragging Movements               | AA    | N/A    | No drag UI.                                                                                                                   |
| 2.5.8  | Target Size (Minimum) 24×24      | AA    | ⚠️     | Buttons are well above; small links in body text rely on the surrounding line-height. To be measured with an automated check. |

## Understandable

| SC    | Title                               | Level | Status | Notes                                                                                                                                                            |
| ----- | ----------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1.1 | Language of Page                    | A     | ✅     | `<html lang="pt-BR">` in `app/layout.tsx`.                                                                                                                       |
| 3.1.2 | Language of Parts                   | AA    | ✅     | No mixed languages outside attributes.                                                                                                                           |
| 3.2.1 | On Focus                            | A     | ✅     | Focus does not trigger context changes.                                                                                                                          |
| 3.2.2 | On Input                            | A     | ✅     | Form requires an explicit submit click; nothing auto-submits.                                                                                                    |
| 3.2.3 | Consistent Navigation               | AA    | ✅     | Header / footer identical across routes.                                                                                                                         |
| 3.2.4 | Consistent Identification           | AA    | ✅     | Same components reused across pages with the same name.                                                                                                          |
| 3.2.6 | Consistent Help                     | A     | ⚠️     | No persistent help affordance yet; `/aprender` is reachable from the nav.                                                                                        |
| 3.3.1 | Error Identification                | A     | ⚠️     | Submission errors today are toast-less; `apiFetch` throws and the form catches silently. To be reworked to surface an inline error message. See "Known gaps" #1. |
| 3.3.2 | Labels or Instructions              | A     | ✅     | Input has placeholder + hint text below.                                                                                                                         |
| 3.3.3 | Error Suggestion                    | AA    | ⚠️     | Same gap as 3.3.1.                                                                                                                                               |
| 3.3.4 | Error Prevention (Legal/Financial)  | AA    | N/A    | No legal/financial commits.                                                                                                                                      |
| 3.3.7 | Redundant Entry                     | A     | ✅     | URL is asked once.                                                                                                                                               |
| 3.3.8 | Accessible Authentication (Minimum) | AA    | N/A    | No login.                                                                                                                                                        |

## Robust

| SC    | Title                     | Level | Status | Notes                                                                                                                                                         |
| ----- | ------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1.1 | Parsing (obsolete in 2.2) | —     | N/A    | Removed in WCAG 2.2.                                                                                                                                          |
| 4.1.2 | Name, Role, Value         | A     | ✅     | Native semantic elements; no custom widgets without ARIA.                                                                                                     |
| 4.1.3 | Status Messages           | AA    | ⚠️     | The audit-detail page uses heading focus + visible status text; consider adding `aria-live="polite"` for the queued/running transitions. See "Known gaps" #2. |

## Known gaps

The ⚠️ rows above mostly need automation, not behavior changes. The
items below are real product gaps, ticketed as follow-ups:

1. **Inline error reporting on `POST /api/audits` failure.** Today
   `apiFetch` throws and the dashboard form silently re-enables the
   submit button. WCAG 3.3.1 / 3.3.3 want a visible explanation of
   what went wrong (rate-limited? unsafe URL? offline?). Add an inline
   `role="alert"` block with the error envelope's `code` mapped to a
   human message.
2. **`aria-live` for status transitions.** When the audit goes
   `queued → running → done`, screen readers don't announce the change
   unless they happen to be on the heading at the moment focus moves.
   Add `aria-live="polite"` on the StatusShell hint paragraph.
3. **Per-page `<title>` metadata.** Audit detail pages would benefit
   from `Audit for example.com — Euthus` instead of the global title.
   Trivial with Next 14 metadata route handlers, deferred to a follow-up
   so the audit-detail page can move to a server component.

## How this stays honest

- `e2e/a11y.spec.ts` runs axe-playwright in CI on every PR. New
  violations at `serious` or `critical` impact fail the build.
- `lighthouserc.json` enforces `categories:accessibility >= 0.95` on
  the same routes.
- This document is reviewed manually whenever the navigation, the
  form, or any color token changes — the PR template's "Component →
  frontend" check is the trigger.
