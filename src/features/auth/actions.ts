"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  LoginInputSchema,
  RegisterInputSchema,
  OnboardingInputSchema,
} from "./schemas";
import { mapAuthError } from "./errors";
import { getSafeNextPath } from "./redirects";
import { getActiveWorkspaceCount } from "./session";
import { hashInviteToken } from "./invite-token";

/**
 * Register a new user with email and password.
 *
 * - Validates input with Zod (email format, password min length, terms accepted)
 * - Calls supabase.auth.signUp with emailRedirectTo for email confirmation
 * - Does NOT write to user_metadata: no system_admin, role, workspace_id, entitlement fields
 * - Profile is created automatically by the existing database trigger
 * - On success, shows a message about checking email
 * - On failure, returns a generic error (no account enumeration)
 */
export async function signUpAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error?: string; success?: boolean; message?: string }> {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
    fullName: formData.get("fullName") as string,
    acceptTerms: formData.get("acceptTerms") === "on",
  };

  const parsed = RegisterInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: {
        full_name: parsed.data.fullName ?? "",
      },
    },
  });

  if (error) {
    return { error: mapAuthError(error) };
  }

  return {
    success: true,
    message: "注册成功！请检查邮箱完成验证后登录。",
  };
}

/**
 * Sign in with email and password.
 *
 * - Validates input with Zod
 * - On success: checks active workspace count
 *   - 0 workspaces → redirect to /onboarding
 *   - ≥1 workspaces → redirect to safe next path or /dashboard
 * - On failure: generic "邮箱或密码错误" (no account enumeration)
 * - next() redirect throws — handled by Next.js, not caught as error
 */
export async function signInAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const next = getSafeNextPath(formData.get("next") as string | null);

  const parsed = LoginInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: mapAuthError(error) };
  }

  // Determine redirect target based on workspace membership
  const workspaceCount = await getActiveWorkspaceCount();

  if (workspaceCount === 0) {
    redirect("/onboarding");
  }

  redirect(next);
}

/**
 * Sign out the current user.
 *
 * - MUST be called via POST (form action), never GET
 * - Clears the Supabase session cookies
 * - Redirects to /login
 */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Create a workspace for the authenticated user (onboarding flow).
 *
 * - Verifies the user is authenticated
 * - Checks the user doesn't already have an active workspace
 * - Calls the existing create_workspace_with_owner RPC
 * - On success: redirects to /dashboard
 * - The RPC atomically creates workspace + owner membership
 */
export async function createWorkspaceAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Verify the user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "请先登录" };
  }

  // Check if user already has an active workspace
  const { count } = await supabase
    .from("workspace_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");

  if (count && count > 0) {
    redirect("/dashboard");
  }

  const raw = {
    workspaceName: formData.get("workspaceName") as string,
    city: formData.get("city") as string,
  };

  const parsed = OnboardingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "输入数据格式不正确" };
  }

  const { error } = await supabase.rpc("create_workspace_with_owner", {
    workspace_name: parsed.data.workspaceName,
    workspace_city: parsed.data.city || null,
  });

  if (error) {
    return { error: "创建工作区失败，请重试" };
  }

  redirect("/dashboard");
}

/**
 * Accept a workspace invitation.
 *
 * - MUST be called via POST (Server Action), never GET
 * - Computes HMAC-SHA-256 digest of the raw token
 * - Calls accept_workspace_invitation RPC
 * - On success: redirects to /dashboard
 * - On failure: returns generic error (no token probing)
 */
export async function acceptInviteAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error?: string }> {
  const token = formData.get("token") as string;

  if (!token) {
    return { error: "邀请链接无效" };
  }

  const supabase = await createClient();

  // Verify the user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "请先登录后再接受邀请" };
  }

  const tokenHash = hashInviteToken(token);

  const { error } = await supabase.rpc("accept_workspace_invitation", {
    p_token_hash: tokenHash,
  });

  if (error) {
    // Generic error — do not reveal if token is invalid, expired, etc.
    return { error: "邀请链接无效或已过期" };
  }

  redirect("/dashboard");
}
