import type { Metadata } from "next";
import { AUDIT_TITLE_FALLBACK, auditTitle } from "@/lib/auditTitle";
import { AuditDetailView } from "./AuditDetailView";

// Server-side fetch budget for the metadata lookup. The audit detail
// page must render even when the api is slow: we fall back to a generic
// title rather than blocking the response on a long fetch.
const METADATA_TIMEOUT_MS = 3000;

// Server-only override (e.g. internal Railway service URL). Falls back
// to the public NEXT_PUBLIC_API_URL so local dev keeps working.
function apiBaseUrl(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

async function fetchAuditUrl(id: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBaseUrl()}/api/audits/${id}`, {
      signal: controller.signal,
      // Don't cache aggressively: the audit changes status frequently,
      // and a shared cache hit could pin a stale "queued" title for
      // seconds. The url field itself is immutable per audit, so a
      // short revalidate is enough to amortize repeat hits.
      next: { revalidate: 30 },
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { url?: string };
    return body.url;
  } catch {
    // Network error, abort, malformed JSON — all fall back to the
    // generic title.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const url = await fetchAuditUrl(id);
  return { title: url ? auditTitle(url) : AUDIT_TITLE_FALLBACK };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditDetailView id={id} />;
}
