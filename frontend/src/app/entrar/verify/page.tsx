"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { copy } from "@/lib/copy";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Cross-origin redirect helper. The magic-link in the email already
 * points at the API origin (so the cookie is set on the right host),
 * but this page exists in case someone shares or pastes the link
 * against the web origin instead. We bounce them to the API verify
 * route so the flow still completes.
 */
export default function VerifyRedirectPage() {
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    if (!token) return;
    window.location.replace(`${API}/api/auth/verify?token=${encodeURIComponent(token)}`);
  }, [params]);

  return (
    <section className="py-16">
      <Container className="flex max-w-md flex-col gap-3">
        <h1 className="font-serif text-2xl text-ink">{copy.auth.verifyingTitle}</h1>
        <p className="text-ink/80">{copy.auth.verifyingLead}</p>
      </Container>
    </section>
  );
}
