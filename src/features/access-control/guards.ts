import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { FeatureKey } from "@/features/entitlements/schemas";

/**
 * Check whether the currently authenticated user is an active system admin.
 *
 * Relies on RLS policy on system_admins: only active system admins can read
 * the table. Non-admins receive zero rows (data is null) — no error thrown,
 * no internal details leaked.
 *
 * Uses the anon key only (no service role). Calls getUser() to validate
 * the auth token with the Supabase Auth server.
 */
export async function isSystemAdmin(): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // system_admins has RLS: only admins can SELECT.
  // Non-admins get 0 rows back; we use maybeSingle() for clean null handling.
  const { data } = await supabase
    .from("system_admins")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  return data !== null;
}

/**
 * Require that the current user is an active system admin.
 * Throws AppError(FORBIDDEN, 403) with a Chinese message if not.
 */
export async function requireSystemAdmin(): Promise<void> {
  if (!(await isSystemAdmin())) {
    throw new AppError("FORBIDDEN", 403, "需要系统管理员权限");
  }
}

/**
 * Check whether the current user holds an active, non-expired feature
 * entitlement.
 *
 * Uses RLS on feature_entitlements: users can read their own entitlements.
 * System admins can read all entitlements. Non-matching queries return null.
 *
 * The status check (active) and expiry check are applied in the application
 * layer to avoid depending on PostgREST time functions in filter syntax.
 */
export async function hasFeature(feature: FeatureKey): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("feature_entitlements")
    .select("id, expires_at")
    .eq("user_id", user.id)
    .eq("feature", feature)
    .eq("status", "active")
    .maybeSingle();

  if (!data) return false;

  // Check expiry: if expires_at is set and in the past, treat as inactive.
  if (data.expires_at && new Date(data.expires_at) <= new Date()) {
    return false;
  }

  return true;
}

/**
 * Require that the current user holds an active feature entitlement.
 * Throws AppError(FEATURE_NOT_ALLOWED, 403) with a Chinese message if not.
 */
export async function requireFeature(feature: FeatureKey): Promise<void> {
  if (!(await hasFeature(feature))) {
    throw new AppError(
      "FEATURE_NOT_ALLOWED",
      403,
      `功能 "${feature}" 未授权，请联系管理员开通`
    );
  }
}
