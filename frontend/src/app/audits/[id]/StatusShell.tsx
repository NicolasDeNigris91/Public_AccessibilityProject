import type { ReactNode, Ref } from "react";
import { Container } from "@/components/ui/Container";

/**
 * Live-region wrapper around the audit-detail status copy. The audit
 * polls every 3 s and transitions queued -> running -> done|failed
 * without navigating away. Screen readers don't notice unless we mark
 * the region that carries the status text as polite + atomic; otherwise
 * only sighted users see the new state.
 *
 * The heading is inside the live region (not just the hint paragraph)
 * because the title is what carries the most informative copy
 * ("Auditando a página" vs. "Aguardando na fila"). aria-atomic="true"
 * makes assistive tech re-announce the whole block on any sub-change,
 * keeping the announcement coherent.
 */
export function StatusShell({
  title,
  hint,
  url,
  action,
  alert,
  headingRef,
}: {
  title: string;
  hint?: string;
  url?: string;
  action?: ReactNode;
  alert?: string | null;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <section className="py-24">
      <Container className="flex flex-col items-start gap-4">
        <div role="status" aria-live="polite" aria-atomic="true" className="flex flex-col gap-3">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-3xl text-ink outline-none md:text-4xl"
          >
            {title}
          </h1>
          {url && <p className="break-all font-mono text-sm text-muted">{url}</p>}
          {hint && <p className="max-w-prose text-ink/80">{hint}</p>}
        </div>
        {action && <div className="mt-2">{action}</div>}
        {alert && <ReauditAlert message={alert} />}
      </Container>
    </section>
  );
}

export function ReauditAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100"
    >
      {message}
    </div>
  );
}
