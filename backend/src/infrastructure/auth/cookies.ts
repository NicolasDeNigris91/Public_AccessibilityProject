export const SESSION_COOKIE_NAME = "euthus_session";

interface SerializeOpts {
  secure: boolean;
  maxAgeSec: number;
  domain?: string;
}

interface ClearOpts {
  secure: boolean;
  domain?: string;
}

function attrs(parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join("; ");
}

export function serializeSessionCookie(value: string, opts: SerializeOpts): string {
  return attrs([
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${opts.maxAgeSec}`,
    opts.secure ? "Secure" : undefined,
    opts.domain ? `Domain=${opts.domain}` : undefined,
  ]);
}

export function clearSessionCookie(opts: ClearOpts): string {
  return attrs([
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    opts.secure ? "Secure" : undefined,
    opts.domain ? `Domain=${opts.domain}` : undefined,
  ]);
}
