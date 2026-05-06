"use client";

import useSWR from "swr";
import { fetchSession, type SessionUser } from "./auth";

export interface UseSessionReturn {
  user: SessionUser | null;
  isLoading: boolean;
  refresh: () => Promise<unknown>;
}

/**
 * SWR hook over GET /api/auth/me. Caches the resolved session for 30s
 * to avoid hammering the API on every component mount, and revalidates
 * on window focus so signing in on another tab updates the header.
 */
export function useSession(): UseSessionReturn {
  const { data, isLoading, mutate } = useSWR<SessionUser | null>("/api/auth/me", fetchSession, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });
  return {
    user: data ?? null,
    isLoading,
    refresh: () => mutate(),
  };
}
