"use client";

import { useActionState, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { signInAction } from "@/features/auth/actions";
import { getSafeNextPath } from "@/features/auth/redirects";
import { LoginInputSchema, type LoginInput } from "@/features/auth/schemas";

export function LoginForm() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const next = rawNext ? getSafeNextPath(rawNext) : undefined;
  const [showPassword, setShowPassword] = useState(false);

  const [state, formAction, isPending] = useActionState(signInAction, {});

  const {
    register,
    formState: { errors },
    watch,
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const formValues = watch();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">登录</h1>
        <p className="text-sm text-muted-foreground mt-2">
          登录阳光智家，管理您的房源与客户
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">邮箱</label>
          <input
            id="email" type="email" autoComplete="email" inputMode="email"
            placeholder="you@example.com"
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-destructive" role="alert">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">密码</label>
          <div className="relative">
            <input
              id="password" type={showPassword ? "text" : "password"}
              autoComplete="current-password" placeholder="至少 8 个字符"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              {...register("password")}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive" role="alert">{errors.password.message}</p>}
        </div>

        {state?.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{state.error}</div>
        )}

        <button type="submit" disabled={isPending || !formValues.email || !formValues.password}
          className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><LogIn className="h-5 w-5 mr-2" />登录</>}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        还没有账号？<Link href="/register" className="ml-1 text-primary hover:underline font-medium">立即注册</Link>
      </p>
    </div>
  );
}
