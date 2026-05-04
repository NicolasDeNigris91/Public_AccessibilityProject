import { calculateScore, countBySeverity } from "./scoring";
import type { SeverityCounts, Violation, WcagSeverity } from "./types";

/**
 * Shape of the payload returned by `axe.run(document, ...)` in the page context.
 * Only the fields we consume are typed. Any extras in the real object are ignored.
 */
export interface AxeRawResult {
  violations: Array<{
    id: string;
    impact: WcagSeverity | null;
    description: string;
    helpUrl: string;
    tags: string[];
    nodes: Array<{ target: string[]; html: string; failureSummary?: string }>;
  }>;
  passes: unknown[];
}

export interface BuiltAuditResult {
  score: number;
  totals: SeverityCounts;
  violations: Violation[];
  passes: number;
}

/**
 * Convert axe violation records into our domain Violation shape. A null `impact`
 * defaults to "minor" because axe can emit null for rules where it was unable to
 * classify severity; treating those as minor keeps the score bounded rather than
 * throwing.
 */
export function toViolations(raw: AxeRawResult): Violation[] {
  return raw.violations.map((v) => ({
    id: v.id,
    impact: (v.impact ?? "minor") as WcagSeverity,
    description: v.description,
    helpUrl: v.helpUrl,
    tags: v.tags,
    nodes: v.nodes.map((n) => {
      // Drop the optional key entirely when undefined so exactOptionalPropertyTypes
      // is happy: `{ failureSummary?: string }` rejects `failureSummary: undefined`.
      const node: Violation["nodes"][number] = { target: n.target, html: n.html };
      if (n.failureSummary !== undefined) node.failureSummary = n.failureSummary;
      return node;
    }),
  }));
}

/**
 * Compose the per-audit metrics (score, totals, passes) around the violation list.
 * Pure: takes raw axe output in, gives a fully-populated domain result out. The
 * worker adds url and durationMs on top before persisting.
 */
export function buildAuditResult(raw: AxeRawResult): BuiltAuditResult {
  const violations = toViolations(raw);
  return {
    score: calculateScore(violations),
    totals: countBySeverity(violations),
    violations,
    passes: raw.passes.length,
  };
}
