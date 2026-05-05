"use client";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Input } from "@/components/ui/Input";
import { API_URL, apiFetch, fetcher } from "@/lib/api";
import { copy } from "@/lib/copy";
import type { AuditStatus, AuditSummary } from "@/lib/types";

const STATUS_LABEL: Record<AuditStatus, string> = {
  queued: copy.dashboard.statusQueued,
  running: copy.dashboard.statusProcessing,
  done: copy.dashboard.statusDone,
  failed: copy.dashboard.statusFailed,
};

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { data, mutate } = useSWR<AuditSummary[]>(`${API_URL}/api/audits`, fetcher, {
    refreshInterval: 3000,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch(`${API_URL}/api/audits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setUrl("");
      mutate();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="py-16">
      <Container className="flex flex-col gap-10">
        <header className="flex flex-col gap-3">
          <h1 className="font-serif text-4xl text-ink md:text-5xl">{copy.dashboard.title}</h1>
          <p className="max-w-prose text-ink/80">{copy.dashboard.lead}</p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Input
                type="url"
                required
                mono
                placeholder={copy.dashboard.submitPlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-label="URL"
              />
            </div>
            <Button type="submit" size="lg" disabled={submitting}>
              {copy.dashboard.submitButton}
            </Button>
          </div>
          <span className="text-xs text-muted">{copy.dashboard.submitHint}</span>
        </form>

        <AuditsTable audits={data} />
      </Container>
    </section>
  );
}

function AuditsTable({ audits }: { audits: AuditSummary[] | undefined }) {
  if (!audits || audits.length === 0) {
    return (
      <p className="rounded border border-dashed border-line py-12 text-center text-muted">
        {copy.dashboard.empty}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line/60 bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-line/60 text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">{copy.dashboard.tableUrl}</th>
            <th className="px-4 py-3 font-medium">{copy.dashboard.tableStatus}</th>
            <th className="px-4 py-3 font-medium">{copy.dashboard.tableScore}</th>
            <th className="px-4 py-3 font-medium">{copy.dashboard.tableDate}</th>
          </tr>
        </thead>
        <tbody>
          {audits.map((a) => (
            <tr key={a.publicId} className="border-t border-line/40">
              <td className="px-4 py-3">
                <Link
                  href={`/audits/${a.publicId}`}
                  className="font-medium text-ink underline decoration-line decoration-dotted underline-offset-4 hover:decoration-brand"
                >
                  {a.url}
                </Link>
              </td>
              <td className="px-4 py-3">
                {a.status === "failed" ? (
                  <Badge severity="critical">{STATUS_LABEL[a.status]}</Badge>
                ) : (
                  <Badge>{STATUS_LABEL[a.status]}</Badge>
                )}
              </td>
              <td className="px-4 py-3 font-mono">
                {a.score != null ? a.score : <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-3 text-muted">
                {new Date(a.createdAt).toLocaleDateString("pt-BR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
