import { z } from "zod";

/** DeepSeek endpoint URLs must use HTTPS. localhost HTTP allowed in dev/test only. */
function deepseekUrl(label: string) {
  return z
    .preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().url().optional()
    )
    .superRefine((val, ctx) => {
      if (val === undefined) return; // unconfigured is OK
      const url = new URL(val);
      const isLocalhost =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]";
      if (url.protocol === "https:") return;
      if (url.protocol === "http:" && isLocalhost) {
        const nodeEnv = process.env.NODE_ENV || "development";
        if (nodeEnv === "development" || nodeEnv === "test") return;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} HTTP localhost only allowed in development/test`,
        });
        return;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must use HTTPS`,
      });
    });
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function getPublicEnv(): PublicEnv {
  const raw = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid public environment variables: ${missing}`);
  }
  return result.data;
}

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  // All AI variables are optional — app starts without them; AI calls fail-closed
  DEEPSEEK_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional()
  ),
  DEEPSEEK_BASE_URL: deepseekUrl("DEEPSEEK_BASE_URL"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  DEEPSEEK_FALLBACK_MODEL: z.string().default("deepseek-v4-pro"),
  // Vision variables — only P3-AI-005 (Vision Provider) needs them; text Provider ignores
  DEEPSEEK_VISION_BASE_URL_PRIMARY: deepseekUrl("DEEPSEEK_VISION_BASE_URL_PRIMARY"),
  DEEPSEEK_VISION_BASE_URL_FALLBACK: deepseekUrl("DEEPSEEK_VISION_BASE_URL_FALLBACK"),
  DEEPSEEK_VISION_API_KEY: z.string().min(1).optional(),
  STT_BASE_URL: deepseekUrl("STT_BASE_URL"),
  STT_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  INVITE_TOKEN_SECRET: z.string().min(32),
  DEEPSEEK_VISION_MODEL: z.string().default("deepseek-vl2"),
  DEEPSEEK_VISION_MAX_IMAGES: z.coerce.number().int().default(8),
  DEEPSEEK_REQUEST_TIMEOUT_MS: z.coerce.number().int().default(45000),
  TRANSCRIPTION_PROVIDER: z.string().optional(),
  MAX_AUDIO_DURATION_SECONDS: z.coerce.number().int().default(60),
  MAX_AUDIO_UPLOAD_BYTES: z.coerce.number().int().default(10485760),
  AI_DAILY_CONTENT_LIMIT: z.coerce.number().int().default(10),
  AI_DAILY_COST_LIMIT_USD: z.coerce.number().default(10.0),
  AI_PREFERENCE_MIN_EVIDENCE: z.coerce.number().int().default(3),
  AI_FAILURE_THRESHOLD: z.coerce.number().int().default(3),
  AI_FAILURE_WINDOW_SECONDS: z.coerce.number().int().default(300),
  AI_QUOTA_TIMEZONE: z.string().default("Asia/Shanghai"),
  COMPLIANCE_BLOCK_COPY: z.coerce.boolean().default(true),
  INITIAL_SYSTEM_ADMIN_EMAIL: z.string().email().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServerEnv() attempted to run in a browser context. " +
        "This function can only be called from server-side code. " +
        "Use getPublicEnv() for client-accessible environment variables."
    );
  }
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Invalid server environment configuration. Missing or invalid: ${missing}. ` +
        "Check your .env.local file against .env.example."
    );
  }
  return result.data;
}
