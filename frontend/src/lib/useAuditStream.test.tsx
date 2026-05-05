/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAuditStream } from "./useAuditStream";

// `useSWR` is a real dependency; mock it so the hook test focuses on
// the SSE wiring and fallback decision, not on the SWR cache surface.
jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));
import useSWRImport from "swr";
const useSWR = useSWRImport as unknown as jest.Mock;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  listeners: Record<string, Array<(ev: { data: string }) => void>> = {};
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(event: string, fn: (ev: { data: string }) => void): void {
    (this.listeners[event] ??= []).push(fn);
  }
  removeEventListener(event: string, fn: (ev: { data: string }) => void): void {
    const list = this.listeners[event];
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }
  close(): void {
    this.closed = true;
  }
  emit(event: string, data: string): void {
    for (const fn of this.listeners[event] ?? []) fn({ data });
  }
  emitNoData(event: string): void {
    for (const fn of (this.listeners[event] ?? []) as Array<() => void>) fn();
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
  useSWR.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: jest.fn(),
  });
});

describe("useAuditStream", () => {
  it("opens an SSE connection at /api/audits/:id/events on mount", () => {
    renderHook(() => useAuditStream("p-1"));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toContain("/api/audits/p-1/events");
  });

  it("returns the parsed state from the SSE 'state' event in preference to SWR", () => {
    useSWR.mockReturnValue({
      data: { publicId: "p-1", status: "queued" },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    });
    const { result } = renderHook(() => useAuditStream("p-1"));
    act(() => {
      MockEventSource.instances[0]?.emit(
        "state",
        JSON.stringify({ publicId: "p-1", status: "running" })
      );
    });
    expect(result.current.data?.status).toBe("running");
    expect(result.current.source).toBe("sse");
  });

  it("closes the SSE connection on the 'end' event", () => {
    renderHook(() => useAuditStream("p-1"));
    act(() => {
      MockEventSource.instances[0]?.emitNoData("end");
    });
    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });

  it("falls back to SWR poll when the SSE connection errors before the first state event", async () => {
    const { result } = renderHook(() => useAuditStream("p-1"));
    act(() => {
      MockEventSource.instances[0]?.emitNoData("error");
    });
    await waitFor(() => expect(result.current.source).toBe("fallback"));
    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });

  it("does NOT fall back to polling on a transient SSE error after a state was delivered", async () => {
    const { result } = renderHook(() => useAuditStream("p-1"));
    act(() => {
      MockEventSource.instances[0]?.emit(
        "state",
        JSON.stringify({ publicId: "p-1", status: "running" })
      );
    });
    act(() => {
      MockEventSource.instances[0]?.emitNoData("error");
    });
    expect(result.current.source).toBe("sse");
    expect(MockEventSource.instances[0]?.closed).toBe(false);
  });

  it("never opens an EventSource when the runtime doesn't support it", () => {
    delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
    const { result } = renderHook(() => useAuditStream("p-1"));
    expect(MockEventSource.instances).toHaveLength(0);
    expect(result.current.source).toBe("fallback");
  });

  it("closes the EventSource on unmount (cleanup)", () => {
    const { unmount } = renderHook(() => useAuditStream("p-1"));
    expect(MockEventSource.instances[0]?.closed).toBe(false);
    unmount();
    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });
});
