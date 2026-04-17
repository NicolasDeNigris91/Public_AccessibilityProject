import { getClientId } from "./clientId";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
  requestId?: string;
}

/**
 * Thrown when the API responds with a non-2xx. Exposes the structured error
 * envelope the backend returns so callers can branch on `code` and show the
 * `requestId` to users for support. When the response is non-JSON (network
 * error, proxy returning HTML, etc.) the error still works with just `status`
 * and a fallback message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  constructor(status: number, body?: ApiErrorBody) {
    super(body?.error?.message ?? `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code;
    this.requestId = body?.requestId;
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const clientId = getClientId();
  if (clientId) headers.set("X-Client-Id", clientId);
  return fetch(input, { ...init, headers });
}

export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await apiFetch(url);
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error response (proxy, timeout, etc.) falls back to bare status.
    }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
};
