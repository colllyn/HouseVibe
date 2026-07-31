import { createHmac } from "crypto";
import { getServerEnv } from "@/config/env";

/**
 * Compute the HMAC-SHA-256 digest of an invite token.
 *
 * The database stores ONLY this digest (never the raw token).
 * The raw token is passed briefly in the invite URL and never persisted.
 *
 * Security requirements:
 * - Raw token NEVER enters: logs, audit metadata, database, localStorage
 * - Token hash uses server-side secret (INVITE_TOKEN_SECRET, min 32 chars)
 * - This function MUST only be called from server-side code
 */
export function hashInviteToken(token: string): string {
  const env = getServerEnv();
  return createHmac("sha256", env.INVITE_TOKEN_SECRET)
    .update(token)
    .digest("hex");
}
