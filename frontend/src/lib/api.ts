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
  // Always send the auth cookie cross-origin. The backend CORS layer
  // already returns Access-Control-Allow-Credentials, so this is the
  // matching client-side opt-in. Anonymous flows still work (no cookie =
  // backend falls back to clientId scope).
  return fetch(input, { ...init, headers, credentials: "include" });
}

async function readErrorBody(res: Response): Promise<ApiErrorBody | undefined> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    // Non-JSON body (e.g. express-rate-limit default), fall back to status only.
    return undefined;
  }
}

export const fetcher = async <T>(url: string): Promise<T> => {
  const res = await apiFetch(url);
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorBody(res));
  }
  return res.json() as Promise<T>;
};

/**
 * POST JSON helper that throws ApiError on non-2xx, parsing the backend
 * error envelope when present. Use this for write endpoints where the
 * caller wants to branch on `code` or surface a human message.
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorBody(res));
  }
  return res.json() as Promise<T>;
}
