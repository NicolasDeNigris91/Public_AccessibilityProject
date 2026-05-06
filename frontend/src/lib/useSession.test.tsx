import { renderHook, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { useSession } from "./useSession";

function wrapper({ children }: { children: ReactNode }) {
  // Disable SWR's process-level cache so each test starts clean.
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

describe("useSession", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("resolves to the user once /api/auth/me returns one", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "a@b.com" } }),
    });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.user?.email).toBe("a@b.com"));
    expect(result.current.isLoading).toBe(false);
  });

  it("resolves to null when no session is present", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("refreshes when refresh() is called (re-issues the fetch)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: null }),
    });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.user).toBeNull());

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "a@b.com" } }),
    });
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => expect(result.current.user?.email).toBe("a@b.com"));
  });
});
