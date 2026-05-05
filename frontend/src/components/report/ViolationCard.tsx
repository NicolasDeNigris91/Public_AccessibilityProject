import { Badge } from "@/components/ui/Badge";
import { copy } from "@/lib/copy";
import type { Violation } from "@/lib/types";

export function ViolationCard({ violation }: { violation: Violation }) {
  const sev = violation.impact;
  const humanImpact = copy.severity[sev]?.humanImpact;

  return (
    <article className="rounded-lg border border-line/60 bg-surface p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge severity={sev}>{copy.severity[sev]?.label ?? sev}</Badge>
            <span className="font-mono text-xs text-muted">{violation.id}</span>
          </div>
          <h3 className="font-serif text-xl text-ink">{violation.description}</h3>
        </div>
        <span className="text-xs text-muted">
          {copy.report.affectedNodes(violation.nodes.length)}
        </span>
      </header>

      {humanImpact && <p className="mt-3 max-w-prose text-sm text-ink/80">{humanImpact}</p>}

      {violation.helpUrl && (
        <a
          href={violation.helpUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-block text-sm text-brand underline-offset-4 hover:underline"
        >
          {copy.report.howToFix} →
        </a>
      )}
    </article>
  );
}
