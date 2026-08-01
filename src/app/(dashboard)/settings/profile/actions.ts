"use server";

import { createClient } from "@/lib/supabase/server";
import { ProfileUpdateSchema, type ProfileUpdateInput } from "@/features/auth/schemas";

/**
 * Update the authenticated user's own profile.
 *
 * - Validates input via Zod
 * - Only allows updating fullName, phone, city, avatarUrl
 * - Only updates the caller's own profile (RLS reinforces this)
 * - Returns { error } on failure, { success: true } on success
 */
export async function updateProfileAction(
  input: ProfileUpdateInput
): Promise<{ error?: string; success?: boolean }> {
  const parsed = ProfileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "请先登录" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      city: parsed.data.city ?? null,
      avatar_url: parsed.data.avatarUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: "保存失败，请重试" };
  }

  return { success: true };
}
