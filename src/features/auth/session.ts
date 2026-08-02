import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Get the authenticated user, or null if not authenticated.
 *
 * Uses getClaims() first (lightweight, reads JWT locally).
 * Falls back to getUser() only when claims are missing.
 *
 * IMPORTANT: This function does NOT redirect. It returns null on failure.
 * Auth gating (redirect to /login) is handled exclusively by middleware.ts.
 * This separation prevents redirects from interfering with Server Actions
 * and Route Handler response cookie propagation.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.sub) {
    return { id: claims.claims.sub } as User;
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getActiveWorkspaceCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from("workspace_members").select("*", { count: "exact", head: true })
    .eq("user_id", user.id).eq("status", "active");
  if (error) return 0;
  return count ?? 0;
}
