import type { Ref } from "react";
import { Button } from "@/components/ui/Button";
import { ScoreDisplay } from "./ScoreDisplay";
import { copy } from "@/lib/copy";

interface ReportHeaderProps {
  url: string;
  score: number;
  createdAt?: string;
  onReaudit?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function ReportHeader({
  url,
  score,
  createdAt,
  onReaudit,
  headingRef,
}: ReportHeaderProps) {
  const formatted = createdAt
    ? new Date(createdAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <header className="flex flex-col gap-8 border-b border-line/60 pb-10 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-3">
        {formatted && <span className="text-xs text-muted">{formatted}</span>}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-4xl text-ink outline-none md:text-5xl"
        >
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-line decoration-2 underline-offset-4 hover:decoration-brand"
          >
            {url}
          </a>
        </h1>
        <div className="flex flex-wrap gap-2">
          {onReaudit && (
            <Button variant="secondary" size="sm" onClick={onReaudit}>
              {copy.report.reauditButton}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled title={copy.report.exportSoon}>
            {copy.report.exportPdf}
          </Button>
          <Button variant="ghost" size="sm" disabled title={copy.report.exportSoon}>
            {copy.report.exportJson}
          </Button>
        </div>
      </div>
      <ScoreDisplay score={score} />
    </header>
  );
}
