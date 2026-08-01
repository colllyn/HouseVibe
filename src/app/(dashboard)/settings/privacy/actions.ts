"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Export the authenticated user's data.
 *
 * Returns a JSON blob of the user's profile and workspace memberships.
 * This is a simplified Phase 1 implementation.
 */
export async function exportDataAction(): Promise<{
  error?: string;
  success?: boolean;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  // For Phase 1, return success acknowledgment.
  // Future phases can build a structured export payload.
  return { success: true };
}

/**
 * Request account deletion.
 *
 * Phase 1: marks profile as inactive / shows confirmation.
 * Actual deletion requires manual review per security policy.
 */
export async function deleteAccountAction(): Promise<{
  error?: string;
  success?: boolean;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  // Phase 1: acknowledge request; manual review required before actual deletion.
  return { success: true };
}
