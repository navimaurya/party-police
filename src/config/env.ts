import path from "node:path";
import { z } from "zod";

/**
 * Server-side environment configuration.
 * Parsed lazily so `next build` does not require secrets to be present.
 * NEVER import this file from a Client Component.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
  ADMIN_PASSWORD: z.string().optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  FILE_SIGNING_SECRET: z
    .string()
    .min(32, "FILE_SIGNING_SECRET must be at least 32 characters"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default("Party Police <party@localhost>"),
  /**
   * TLS from the first byte. Leave unset to decide from the port: 465 = TLS, 587/25 = STARTTLS.
   * (Unset must stay `undefined`, not `false`: forcing plain text on 465 hangs with "Greeting never received".)
   */
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  CRON_SECRET: z.string().optional().default(""),
  STORAGE_PATH: z.string().default("./storage"),
  MAX_FILE_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  RUN_WORKER_IN_APP: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
  THANK_YOU_DELAY_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(5 * 60 * 1000),
  /** IANA timezone used for "party day" and the daily 9 AM emails. */
  APP_TIMEZONE: z
    .string()
    .default("Asia/Kolkata")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "APP_TIMEZONE must be a valid IANA timezone, e.g. Asia/Kolkata"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Absolute path to the private storage root. */
export function storageRoot(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    env().STORAGE_PATH,
  );
}

/** For tests: reset cached env after mutating process.env. */
export function resetEnvCache() {
  cached = null;
}
