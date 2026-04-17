"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { copy } from "@/lib/copy";

/**
 * Next.js App Router error boundary for /audits/[id]. Catches any render-time or
 * data-loading crash the page could throw (malformed violation payload, unexpected
 * runtime error) and shows a recoverable shell with a retry button that re-runs
 * the segment. Without this, a bad payload would surface as the default Next
 * error page.
 */
export default function AuditDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("audit detail page crashed", error);
  }, [error]);

  return (
    <section className="py-24">
      <Container className="flex flex-col items-start gap-4">
        <h1 className="font-serif text-3xl text-ink md:text-4xl">
          {copy.report.states.crash}
        </h1>
        <p className="max-w-prose text-ink/80">
          {copy.report.states.crashHint}
        </p>
        <div className="mt-2">
          <Button onClick={reset}>{copy.report.states.retry}</Button>
        </div>
      </Container>
    </section>
  );
}
