/**
 * Stable auth error codes with user-facing Chinese messages.
 * Supabase internal errors MUST NOT be shown directly to users.
 */

export const AUTH_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "邮箱或密码错误",
  SIGNUP_FAILED: "注册失败，请稍后重试",
  SESSION_EXPIRED: "会话已过期，请重新登录",
  RATE_LIMITED: "操作过于频繁，请稍后重试",
  VALIDATION_FAILED: "输入数据格式不正确",
  INTERNAL_ERROR: "服务器内部错误，请稍后重试",
  INVITE_INVALID: "邀请链接无效或已过期",
  INVITE_ALREADY_USED: "该邀请已被使用",
  WORKSPACE_CREATE_FAILED: "创建工作区失败，请重试",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

/**
 * Map Supabase auth errors to generic, non-enumerating messages.
 *
 * CRITICAL: Login failure must NOT differentiate between:
 * - "email doesn't exist"
 * - "wrong password"
 * - "user uses a different login method"
 *
 * All three return the same generic "邮箱或密码错误" message.
 */
export function mapAuthError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Invalid credentials — always generic, no differentiation
    if (
      msg.includes("invalid login credentials") ||
      msg.includes("invalid_credentials") ||
      msg.includes("invalid email")
    ) {
      return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;
    }

    // Rate limiting
    if (msg.includes("rate") || msg.includes("limit") || msg.includes("too many")) {
      return AUTH_ERROR_MESSAGES.RATE_LIMITED;
    }

    // Email not confirmed
    if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
      return "请先验证邮箱后再登录";
    }
  }

  // Generic fallback — never leak stack traces or internal details
  return AUTH_ERROR_MESSAGES.INTERNAL_ERROR;
}

/**
 * Get the standard Chinese message for a known error code.
 */
export function getAuthErrorMessage(code: AuthErrorCode): string {
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.INTERNAL_ERROR;
}
