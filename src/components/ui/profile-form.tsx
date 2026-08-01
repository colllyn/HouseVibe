"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Phone, MapPin, Image, Loader2, CheckCircle } from "lucide-react";
import { SettingsFormCard } from "@/components/ui/settings-form-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

// --- Schema ---

export const ProfileFormSchema = z.object({
  fullName: z
    .string()
    .min(1, "请输入姓名")
    .max(100, "姓名最多 100 个字符"),
  phone: z
    .string()
    .max(30, "手机号最多 30 个字符")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  city: z
    .string()
    .max(50, "城市名最多 50 个字符")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  avatarUrl: z
    .string()
    .max(500, "头像 URL 过长")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ProfileFormData = z.infer<typeof ProfileFormSchema>;

// --- Component Props ---

export interface ProfileFormProps {
  /** Initial profile data. Pass null while loading. */
  initialData?: {
    fullName?: string | null;
    phone?: string | null;
    city?: string | null;
    avatarUrl?: string | null;
  } | null;
  /** Whether the initial data is still loading */
  isLoading?: boolean;
  /** Error loading initial data */
  loadError?: string | null;
  /** Callback to retry loading initial data */
  onRetryLoad?: () => void;
  /** Submit handler — returns error or success */
  onSubmit: (
    data: ProfileFormData
  ) => Promise<{ error?: string; success?: boolean }>;
}

// --- Component ---

export function ProfileForm({
  initialData,
  isLoading = false,
  loadError,
  onRetryLoad,
  onSubmit,
}: ProfileFormProps) {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      city: "",
      avatarUrl: "",
    },
  });

  // Reset form when initial data changes
  React.useEffect(() => {
    if (initialData) {
      reset({
        fullName: initialData.fullName ?? "",
        phone: initialData.phone ?? "",
        city: initialData.city ?? "",
        avatarUrl: initialData.avatarUrl ?? "",
      });
    }
  }, [initialData, reset]);

  // Loading state for initial data
  if (isLoading) {
    return (
      <section>
        <SettingsFormCard title="个人资料" description="管理您的个人信息">
          <LoadingState message="加载中..." />
        </SettingsFormCard>
      </section>
    );
  }

  // Error loading initial data
  if (loadError) {
    return (
      <section>
        <SettingsFormCard title="个人资料" description="管理您的个人信息">
          <ErrorState
            title="加载失败"
            description={loadError}
            onRetry={onRetryLoad}
          />
        </SettingsFormCard>
      </section>
    );
  }

  // No data (should not happen after loading, but handle gracefully)
  if (!initialData) {
    return (
      <section>
        <SettingsFormCard title="个人资料" description="管理您的个人信息">
          <ErrorState
            title="暂无数据"
            description="无法加载个人资料，请重试"
            onRetry={onRetryLoad}
          />
        </SettingsFormCard>
      </section>
    );
  }

  const handleFormSubmit = async (data: ProfileFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const result = await onSubmit(data);

      if (result.error) {
        setSubmitError(result.error);
      } else if (result.success !== false) {
        setSuccessMessage("个人资料已保存");
        // Allow the success message to be visible; reset isDirty
        reset(data);
        // Auto-dismiss success
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch {
      setSubmitError("保存失败，请检查网络后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Field wrapper for consistent layout
  function FieldWrapper({
    label,
    icon: Icon,
    error,
    children,
  }: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    error?: string;
    children: React.ReactNode;
  }) {
    return (
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </label>
        {children}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const footer = (
    <>
      {successMessage ? (
        <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
          <CheckCircle className="h-4 w-4" />
          {successMessage}
        </span>
      ) : null}
      <button
        type="submit"
        form="profile-form"
        disabled={!isDirty || isSubmitting}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-4 py-2.5",
          "text-sm font-medium transition-colors",
          "min-h-[44px]",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            保存中...
          </>
        ) : (
          "保存"
        )}
      </button>
    </>
  );

  return (
    <section>
      <SettingsFormCard
        title="个人资料"
        description="管理您的个人信息"
        error={submitError}
        successMessage={null}
        isSubmitting={isSubmitting}
        footer={footer}
      >
        <form
          id="profile-form"
          onSubmit={handleSubmit(handleFormSubmit)}
          className="space-y-4"
          noValidate
        >
          <FieldWrapper
            label="姓名"
            icon={User}
            error={errors.fullName?.message}
          >
            <input
              type="text"
              autoComplete="name"
              {...register("fullName")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                "min-h-[44px]",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                errors.fullName ? "border-destructive" : "border-input"
              )}
              placeholder="请输入您的姓名"
            />
          </FieldWrapper>

          <FieldWrapper
            label="手机号"
            icon={Phone}
            error={errors.phone?.message}
          >
            <input
              type="tel"
              autoComplete="tel"
              {...register("phone")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                "min-h-[44px]",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                errors.phone ? "border-destructive" : "border-input"
              )}
              placeholder="请输入手机号"
            />
          </FieldWrapper>

          <FieldWrapper
            label="所在城市"
            icon={MapPin}
            error={errors.city?.message}
          >
            <input
              type="text"
              autoComplete="address-level2"
              {...register("city")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                "min-h-[44px]",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                errors.city ? "border-destructive" : "border-input"
              )}
              placeholder="请输入所在城市"
            />
          </FieldWrapper>

          <FieldWrapper
            label="头像链接"
            icon={Image}
            error={errors.avatarUrl?.message}
          >
            <div className="flex items-center gap-3">
              {/* Avatar preview */}
              <div
                className={cn(
                  "h-12 w-12 flex-shrink-0 rounded-full",
                  "flex items-center justify-center",
                  "bg-muted text-muted-foreground",
                  "border text-xs font-medium",
                  "overflow-hidden"
                )}
              >
                {initialData.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase storage URLs require onError fallback; next/image impractical */
                  <img
                    src={initialData.avatarUrl}
                    alt="头像预览"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <User className="h-6 w-6" />
                )}
              </div>
              <input
                type="url"
                autoComplete="photo"
                {...register("avatarUrl")}
                className={cn(
                  "flex-1 rounded-md border bg-background px-3 py-2.5 text-sm",
                  "min-h-[44px]",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  errors.avatarUrl ? "border-destructive" : "border-input"
                )}
                placeholder="输入头像图片链接"
              />
            </div>
          </FieldWrapper>
        </form>
      </SettingsFormCard>
    </section>
  );
}
