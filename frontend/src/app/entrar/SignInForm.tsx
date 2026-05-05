"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { requestMagicLink } from "@/lib/auth";
import { copy } from "@/lib/copy";

const ERROR_COPY: Record<string, string> = {
  invalid_email: copy.auth.errorEmailInvalid,
  rate_limited_per_ip_email: copy.auth.errorRateLimited,
  rate_limited_per_client: copy.auth.errorRateLimited,
  "auth/email-not-configured": copy.auth.errorEmailNotConfigured,
};

function messageForError(err: unknown): string {
  const code = err instanceof Error ? err.message : "";
  return ERROR_COPY[code] ?? copy.auth.errorGeneric;
}

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestMagicLink(email);
      router.push("/entrar/check");
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate={false}
      className="flex flex-col gap-4"
      aria-describedby={error ? "signin-error" : undefined}
    >
      <Input
        type="email"
        required
        label={copy.auth.emailLabel}
        placeholder={copy.auth.emailPlaceholder}
        value={email}
        autoComplete="email"
        autoFocus
        onChange={(e) => setEmail(e.target.value)}
        {...(error ? { error } : {})}
      />
      <Button type="submit" size="lg" disabled={submitting || email.length === 0}>
        {submitting ? copy.auth.submittingButton : copy.auth.submitButton}
      </Button>
      {error && (
        <p id="signin-error" role="alert" className="text-sm text-severity-critical">
          {error}
        </p>
      )}
    </form>
  );
}
