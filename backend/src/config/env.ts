import { z } from "zod";

const mongoUri = z
  .string()
  .regex(/^mongodb(\+srv)?:\/\//, "MONGO_URI must start with mongodb:// or mongodb+srv://");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default("info"),
  MONGO_URI: mongoUri,
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(30),
  AUDIT_TIMEOUT_MS: z.coerce.number().default(45_000),
  MAX_CONCURRENT_AUDITS: z.coerce.number().default(2),
  WORKER_METRICS_PORT: z.coerce.number().default(9100),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v: string) => v === "true"),
  // Bull-Board admin UI is mounted at /admin/queues and protected by
  // basic auth. Both vars are required to mount the route. If either
  // is missing, the route is intentionally not exposed (the api still
  // boots normally) so a misconfigured prod cannot accidentally serve
  // the admin UI without credentials.
  ADMIN_USER: z.string().min(1).optional(),
  ADMIN_PASS: z.string().min(8).optional(),
  // Soft-auth (magic-link). The provider is optional in dev/test (the
  // factory falls back to consoleSender) but required in production: the
  // /api/auth/magic-link route 503s with a clear hint when EMAIL_PROVIDER
  // is unset in prod, so missing config never silently degrades to the
  // console where logs may be public.
  EMAIL_PROVIDER: z.enum(["resend"]).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  WEB_BASE_URL: z.string().url().default("http://localhost:4000"),
  APP_REDIRECT_URL: z.string().url().default("http://localhost:3000/app"),
  // Optional Domain attribute on the session cookie. Set only when api
  // and web share a parent (e.g. ".euthus.com"); otherwise leave unset
  // and the cookie is host-locked.
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  SESSION_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 86_400_000),
  MAGIC_LINK_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
