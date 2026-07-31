import { z } from "zod";

/**
 * Login form schema.
 * Normalizes email (lowercase + trim) for consistent comparison.
 * Password minimum 8 characters.
 */
export const LoginInputSchema = z.object({
  email: z
    .string()
    .min(1, "请输入邮箱")
    .email("邮箱格式不正确")
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8, "密码至少 8 个字符"),
});

/**
 * Registration form schema.
 * Validates password confirmation match, terms acceptance.
 * Email is normalized.
 */
export const RegisterInputSchema = z
  .object({
    email: z
      .string()
      .min(1, "请输入邮箱")
      .email("邮箱格式不正确")
      .transform((v) => v.toLowerCase().trim()),
    password: z.string().min(8, "密码至少 8 个字符"),
    confirmPassword: z.string().min(1, "请确认密码"),
    fullName: z.string().optional(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "请先同意服务条款" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });

/**
 * Onboarding / workspace creation form schema.
 * Workspace name is required, city is optional.
 */
export const OnboardingInputSchema = z.object({
  workspaceName: z.string().min(1, "请输入工作区名称").max(100, "名称最多 100 个字符"),
  city: z.string().max(50, "城市名最多 50 个字符").optional(),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;
