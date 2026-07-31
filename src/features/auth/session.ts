import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

/**
 * Get the authenticated user, or throw a redirect to /login.
 *
 * Uses getUser() which validates the token with the Supabase Auth server.
 * This is the correct method for authorization decisions.
 *
 * DO NOT use getSession().data.session?.user for authorization —
 * getSession() only reads the local JWT without validating it.
 */
export async function getAuthenticatedUser(): Promise<User> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return user;
}

/**
 * Count the number of active workspace memberships for the current user.
 * Returns 0 if the user is not authenticated or has no active memberships.
 *
 * Queries workspace_members table which has RLS policies applied.
 */
export async function getActiveWorkspaceCount(): Promise<number> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return 0;

  const { count, error } = await supabase
    .from("workspace_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) return 0;

  return count ?? 0;
}
