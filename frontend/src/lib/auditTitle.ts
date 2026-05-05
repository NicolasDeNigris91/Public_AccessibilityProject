// Page title for /audits/[id]. Per A11Y-AUDIT.md gap #3 (WCAG 2.4.2
// Page Titled), each audit detail page should describe its own purpose
// instead of inheriting the global brand title. The visible URL of the
// audit subject is the most descriptive thing we can put there.

const FALLBACK = "Auditoria — Euthus";

/**
 * Build a per-audit page title from the audited URL. Returns a generic
 * fallback when the URL is missing or malformed so we always render
 * something coherent.
 */
export function auditTitle(url: string | undefined): string {
  if (!url) return FALLBACK;
  try {
    const host = new URL(url).hostname;
    if (!host) return FALLBACK;
    return `Auditoria de ${host} — Euthus`;
  } catch {
    return FALLBACK;
  }
}

export const AUDIT_TITLE_FALLBACK = FALLBACK;
