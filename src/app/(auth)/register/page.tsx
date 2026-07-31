"use client";

import { useActionState, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { signUpAction } from "@/features/auth/actions";
import { RegisterInputSchema, type RegisterInput } from "@/features/auth/schemas";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [state, formAction, isPending] = useActionState(signUpAction, {});

  const {
    register,
    formState: { errors },
    watch,
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterInputSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      acceptTerms: false as unknown as true,
    },
  });

  const formValues = watch();

  // Show success state instead of form
  if (state?.success) {
    return (
      <div className="space-y-6 text-center">
        <div className="rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">注册成功</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {state.message ?? "请检查邮箱完成验证。"}
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary text-primary-foreground font-medium px-8 hover:bg-primary/90 transition-colors"
        >
          前往登录
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">注册</h1>
        <p className="text-sm text-muted-foreground mt-2">
          创建您的阳光智家账号
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-sm text-destructive" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            密码
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="至少 8 个字符"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            确认密码
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="再次输入密码"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              {...register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={showConfirm ? "隐藏密码" : "显示密码"}
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-destructive" role="alert">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Name (optional) */}
        <div className="space-y-2">
          <label htmlFor="fullName" className="text-sm font-medium">
            姓名 <span className="text-muted-foreground font-normal">（选填）</span>
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="您的姓名"
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            {...register("fullName")}
          />
        </div>

        {/* Terms Checkbox */}
        <div className="flex items-start gap-3 min-h-[44px]">
          <input
            id="acceptTerms"
            type="checkbox"
            className="mt-1 h-6 w-6 rounded border-input accent-primary"
            {...register("acceptTerms")}
          />
          <label htmlFor="acceptTerms" className="text-sm text-muted-foreground leading-relaxed">
            我已阅读并同意
            <span className="text-primary underline ml-1">服务条款</span>
            和
            <span className="text-primary underline ml-1">隐私政策</span>
          </label>
        </div>
        {errors.acceptTerms && (
          <p className="text-sm text-destructive" role="alert">
            {errors.acceptTerms.message}
          </p>
        )}

        {/* Error message */}
        {state?.error && (
          <div
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {state.error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending || !formValues.email || !formValues.password || !formValues.confirmPassword || !formValues.acceptTerms}
          className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <UserPlus className="h-5 w-5 mr-2" />
              注册
            </>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        已有账号？
        <Link href="/login" className="ml-1 text-primary hover:underline font-medium">
          立即登录
        </Link>
      </p>
    </div>
  );
}
