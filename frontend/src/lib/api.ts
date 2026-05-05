import { getClientId } from "./clientId";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
  requestId?: string;
}

// Thrown on any non-2xx. Carries the backend error envelope when present.
// exactOptionalPropertyTypes: only assign optional fields when defined,
// otherwise leave them off entirely.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  constructor(status: number, body?: ApiErrorBody) {
    super(body?.error?.message ?? `API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    if (body?.error?.code !== undefined) this.code = body.error.code;
    if (body?.requestId !== undefined) this.requestId = body.requestId;
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
      // Non-JSON body, fall back to status only.
    }
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
};
