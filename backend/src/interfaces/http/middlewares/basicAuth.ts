import crypto from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Basic-auth middleware intended for low-traffic admin surfaces such
 * as the Bull-Board UI. Compares the supplied credentials with the
 * configured pair using `crypto.timingSafeEqual` to avoid leaking
 * the right answer through string-comparison timing. On any mismatch
 * (or missing / malformed header), responds 401 with a single
 * generic body and a `WWW-Authenticate: Basic` challenge so a real
 * browser surfaces the credential prompt.
 *
 * Not for the public API — use a session / token scheme there.
 */
export interface BasicAuthOptions {
  user: string;
  pass: string;
  realm?: string;
}

const HEADER_PREFIX = "Basic ";

function fixedTimeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers. Pad both to the
  // longer length so the comparison always runs on the same number of
  // bytes, then also compare the lengths separately to defeat the
  // pad trick. Prevents leaking the *length* of the secret through
  // early-exit timing.
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  const len = Math.max(aBuf.length, bBuf.length);
  const aPadded = Buffer.concat([aBuf, Buffer.alloc(len - aBuf.length)]);
  const bPadded = Buffer.concat([bBuf, Buffer.alloc(len - bBuf.length)]);
  return crypto.timingSafeEqual(aPadded, bPadded) && aBuf.length === bBuf.length;
}

export function basicAuth(opts: BasicAuthOptions): RequestHandler {
  const realm = opts.realm ?? "admin";
  return (req, res, next) => {
    const header = req.header("authorization") ?? "";
    if (!header.startsWith(HEADER_PREFIX)) {
      res.set("WWW-Authenticate", `Basic realm="${realm}"`);
      res.status(401).send("Authentication required");
      return;
    }
    const decoded = Buffer.from(header.slice(HEADER_PREFIX.length), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) {
      res.set("WWW-Authenticate", `Basic realm="${realm}"`);
      res.status(401).send("Authentication required");
      return;
    }
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    const ok = fixedTimeEqual(user, opts.user) && fixedTimeEqual(pass, opts.pass);
    if (!ok) {
      res.set("WWW-Authenticate", `Basic realm="${realm}"`);
      res.status(401).send("Authentication required");
      return;
    }
    next();
  };
}
