"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type Ref } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { ReportHeader } from "@/components/report/ReportHeader";
import { SeverityBreakdown } from "@/components/report/SeverityBreakdown";
import { ViolationCard } from "@/components/report/ViolationCard";
import { API_URL, fetcher, postJson } from "@/lib/api";
import { deriveAuditState, pollingIntervalFor } from "@/lib/auditState";
import { copy } from "@/lib/copy";
import { submitErrorMessage } from "@/lib/errorMessages";
import type { AuditDetail } from "@/lib/types";
import { ReauditAlert, StatusShell } from "./StatusShell";

const SEVERITY_WEIGHT = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;

export function AuditDetailView({ id }: { id: string }) {
  const router = useRouter();
  const reauditInFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [reauditError, setReauditError] = useState<string | null>(null);

  // Move focus to the top heading when the audit id changes (first mount and
  // after re-audit navigates to a fresh publicId). Screen readers announce the
  // new page; sighted users see no visual jump because tabIndex=-1 focus is
  // programmatic only.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false });
  }, [id]);

  const { data, error, isLoading, mutate } = useSWR<AuditDetail>(
    `${API_URL}/api/audits/${id}`,
    fetcher,
    {
      refreshInterval: pollingIntervalFor,
      shouldRetryOnError: false,
    }
  );

  const state = deriveAuditState(data, error, isLoading);
  const s = copy.report.states;

  async function reaudit(url: string) {
    if (reauditInFlight.current) return;
    reauditInFlight.current = true;
    setReauditError(null);
    try {
      const { publicId } = await postJson<{ publicId: string }>(`${API_URL}/api/audits`, { url });
      router.push(`/audits/${publicId}`);
    } catch (err) {
      reauditInFlight.current = false;
      setReauditError(submitErrorMessage(err));
    }
  }

  switch (state.kind) {
    case "loading":
      return <StatusShell title={s.loading} headingRef={headingRef} />;

    case "not-found":
      return (
        <StatusShell
          title={s.notFound}
          hint={s.notFoundHint}
          headingRef={headingRef}
          action={
            <Link href="/app">
              <Button>{s.newAudit}</Button>
            </Link>
          }
        />
      );

    case "error":
      return (
        <StatusShell
          title={s.error}
          hint={s.errorHint}
          headingRef={headingRef}
          action={<Button onClick={() => mutate()}>{s.retry}</Button>}
        />
      );

    case "queued":
      return (
        <StatusShell
          title={s.queued}
          hint={s.queuedHint}
          url={state.data.url}
          headingRef={headingRef}
        />
      );

    case "running":
      return (
        <StatusShell
          title={s.running}
          hint={s.runningHint}
          url={state.data.url}
          headingRef={headingRef}
        />
      );

    case "failed":
      return (
        <StatusShell
          title={s.failed}
          hint={s.failedHint}
          url={state.data.url}
          headingRef={headingRef}
          action={<Button onClick={() => reaudit(state.data.url)}>{s.retry}</Button>}
          alert={reauditError}
        />
      );

    case "done":
      return (
        <ReportView
          data={state.data}
          onReaudit={() => reaudit(state.data.url)}
          headingRef={headingRef}
          alert={reauditError}
        />
      );
  }
}

function ReportView({
  data,
  onReaudit,
  alert,
  headingRef,
}: {
  data: AuditDetail;
  onReaudit: () => void;
  alert?: string | null;
  headingRef: Ref<HTMLHeadingElement> | undefined;
}) {
  const totals = data.totals ?? { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const total = totals.critical + totals.serious + totals.moderate + totals.minor;
  const sorted = [...data.violations].sort(
    (a, b) => SEVERITY_WEIGHT[a.impact] - SEVERITY_WEIGHT[b.impact]
  );

  return (
    <section className="py-16">
      <Container className="flex flex-col gap-12">
        <ReportHeader
          url={data.url}
          score={data.score ?? 0}
          createdAt={data.createdAt}
          onReaudit={onReaudit}
          headingRef={headingRef}
        />
        {alert && <ReauditAlert message={alert} />}

        <div className="flex flex-col gap-6">
          <p className="max-w-prose text-lg text-ink/85">
            {copy.report.barriersSummary(total, totals.critical)}
          </p>
          <SeverityBreakdown totals={totals} />
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl text-ink">{copy.report.violationsTitle}</h2>
          {sorted.length === 0 ? (
            <p className="rounded border border-dashed border-line py-12 text-center text-muted">
              {copy.report.emptyViolations}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {sorted.map((v) => (
                <li key={v.id}>
                  <ViolationCard violation={v} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </section>
  );
}
