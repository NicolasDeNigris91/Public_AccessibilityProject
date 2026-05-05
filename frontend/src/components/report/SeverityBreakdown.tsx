import type { Severity, SeverityTotals } from "@/lib/types";
import { copy } from "@/lib/copy";

const ORDER: Severity[] = ["critical", "serious", "moderate", "minor"];

const DOT: Record<Severity, string> = {
  critical: "bg-severity-critical",
  serious: "bg-severity-serious",
  moderate: "bg-severity-moderate",
  minor: "bg-severity-minor",
};

export function SeverityBreakdown({ totals }: { totals: SeverityTotals }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {ORDER.map((sev) => (
        <div key={sev} className="flex flex-col gap-2 rounded border border-line/60 bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${DOT[sev]}`} aria-hidden />
            <dt className="text-xs uppercase tracking-wider text-muted">
              {copy.severity[sev].label}
            </dt>
          </div>
          <dd className="font-serif text-4xl text-ink">{totals[sev] ?? 0}</dd>
        </div>
      ))}
    </dl>
  );
}
