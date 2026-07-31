"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Building2 } from "lucide-react";
import { createWorkspaceAction } from "@/features/auth/actions";
import {
  OnboardingInputSchema,
  type OnboardingInput,
} from "@/features/auth/schemas";

export default function OnboardingPage() {
  const [state, formAction, isPending] = useActionState(createWorkspaceAction, {});

  const {
    register,
    formState: { errors },
    watch,
  } = useForm<OnboardingInput>({
    resolver: zodResolver(OnboardingInputSchema),
    defaultValues: {
      workspaceName: "",
      city: "",
    },
  });

  const formValues = watch();

  return (
    <div className="min-h-[80dvh] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">创建您的工作区</h1>
          <p className="text-sm text-muted-foreground mt-2">
            工作区是您的独立业务空间，所有房源和客户数据仅在工作区内可见。
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          {/* Workspace Name */}
          <div className="space-y-2">
            <label htmlFor="workspaceName" className="text-sm font-medium">
              工作区名称 <span className="text-destructive">*</span>
            </label>
            <input
              id="workspaceName"
              type="text"
              autoComplete="organization"
              placeholder="例如：XX房产门店"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              {...register("workspaceName")}
            />
            {errors.workspaceName && (
              <p className="text-sm text-destructive" role="alert">
                {errors.workspaceName.message}
              </p>
            )}
          </div>

          {/* City (optional) */}
          <div className="space-y-2">
            <label htmlFor="city" className="text-sm font-medium">
              所在城市 <span className="text-muted-foreground font-normal">（选填）</span>
            </label>
            <input
              id="city"
              type="text"
              autoComplete="address-level2"
              placeholder="例如：广州"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              {...register("city")}
            />
            {errors.city && (
              <p className="text-sm text-destructive" role="alert">
                {errors.city.message}
              </p>
            )}
          </div>

          {/* Error message */}
          {state?.error && (
            <div
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </div>
          )}

          {/* Privacy notice */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            点击&ldquo;创建工作区&rdquo;即表示您同意我们的
            <span className="text-primary underline ml-1">服务条款</span>
            和
            <span className="text-primary underline ml-1">隐私政策</span>
            。您的数据仅在工作区内可见，未经授权不会被共享。
          </p>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !formValues.workspaceName}
            className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "创建工作区"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
