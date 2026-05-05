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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
