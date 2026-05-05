"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/lib/useSession";
import { logout } from "@/lib/auth";
import { copy } from "@/lib/copy";
import type { SessionUser } from "@/lib/auth";

export interface SessionPillViewProps {
  user: SessionUser | null;
  isLoading: boolean;
  onSignOut?: () => void | Promise<void>;
  signingOut?: boolean;
}

/**
 * Presentational header pill. Pure props in, no data fetching — kept
 * separate from the container so Storybook (and any future server-rendered
 * shell variant) can drive each visual state directly.
 */
export function SessionPillView({
  user,
  isLoading,
  onSignOut,
  signingOut = false,
}: SessionPillViewProps) {
  if (isLoading) {
    // Reserve a stable footprint so the header layout doesn't shift
    // between SSR and the first client revalidation.
    return <div className="h-8 w-20" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        href="/entrar"
        className="inline-flex h-8 items-center rounded px-2 text-sm font-medium text-ink/80 transition-colors hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {copy.auth.signin}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        title={copy.auth.signedInAs(user.email)}
        aria-label={copy.auth.signedInAs(user.email)}
        className="hidden max-w-[14rem] truncate text-ink/80 sm:inline"
      >
        {user.email}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="inline-flex h-8 items-center rounded border border-line/60 px-2 text-sm font-medium text-ink/80 transition-colors hover:bg-surface hover:text-ink disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {copy.auth.logout}
      </button>
    </div>
  );
}

/**
 * Header pill, container variant. Wires `useSession` to the view and
 * runs `logout` + cache revalidation on sign-out so other components
 * react immediately to the state change.
 */
export function SessionPill() {
  const { user, isLoading, refresh } = useSession();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SessionPillView user={user} isLoading={isLoading} onSignOut={onSignOut} signingOut={busy} />
  );
}
