"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building,
  MapPin,
  Briefcase,
  Loader2,
  CheckCircle,
  Lock,
} from "lucide-react";
import { SettingsFormCard } from "@/components/ui/settings-form-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

// --- Schema ---

export const WorkspaceFormSchema = z.object({
  name: z.string().min(1, "请输入工作区名称").max(100, "名称最多 100 个字符"),
  city: z
    .string()
    .max(50, "城市名最多 50 个字符")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  businessType: z
    .string()
    .max(100, "业务类型最多 100 个字符")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type WorkspaceFormData = z.infer<typeof WorkspaceFormSchema>;

// --- Component Props ---

export interface WorkspaceFormProps {
  /** Initial workspace data. Pass null while loading. */
  initialData?: {
    name?: string | null;
    city?: string | null;
    businessType?: string | null;
  } | null;
  /** Whether the initial data is still loading */
  isLoading?: boolean;
  /** Error loading initial data */
  loadError?: string | null;
  /** Callback to retry loading initial data */
  onRetryLoad?: () => void;
  /** Whether the current user is the workspace owner */
  isOwner: boolean;
  /** Submit handler — returns error or success */
  onSubmit: (
    data: WorkspaceFormData
  ) => Promise<{ error?: string; success?: boolean }>;
}

// --- Component ---

export function WorkspaceForm({
  initialData,
  isLoading = false,
  loadError,
  onRetryLoad,
  isOwner,
  onSubmit,
}: WorkspaceFormProps) {
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
  } = useForm<WorkspaceFormData>({
    resolver: zodResolver(WorkspaceFormSchema),
    defaultValues: {
      name: "",
      city: "",
      businessType: "",
    },
  });

  // Reset form when initial data changes
  React.useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name ?? "",
        city: initialData.city ?? "",
        businessType: initialData.businessType ?? "",
      });
    }
  }, [initialData, reset]);

  // Loading state
  if (isLoading) {
    return (
      <section>
        <SettingsFormCard title="工作区信息" description="管理工作区基本设置">
          <LoadingState message="加载工作区信息..." />
        </SettingsFormCard>
      </section>
    );
  }

  // Error state
  if (loadError) {
    return (
      <section>
        <SettingsFormCard title="工作区信息" description="管理工作区基本设置">
          <ErrorState
            title="加载失败"
            description={loadError}
            onRetry={onRetryLoad}
          />
        </SettingsFormCard>
      </section>
    );
  }

  // No data state
  if (!initialData) {
    return (
      <section>
        <SettingsFormCard title="工作区信息" description="管理工作区基本设置">
          <ErrorState
            title="暂无数据"
            description="无法加载工作区信息，请重试"
            onRetry={onRetryLoad}
          />
        </SettingsFormCard>
      </section>
    );
  }

  const handleFormSubmit = async (data: WorkspaceFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const result = await onSubmit(data);

      if (result.error) {
        setSubmitError(result.error);
      } else if (result.success !== false) {
        setSuccessMessage("工作区信息已保存");
        reset(data);
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch {
      setSubmitError("保存失败，请检查网络后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        form="workspace-form"
        disabled={!isOwner || !isDirty || isSubmitting}
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
        title="工作区信息"
        description="管理工作区基本设置"
        error={submitError}
        isSubmitting={isSubmitting}
        footer={isOwner ? footer : undefined}
      >
        {!isOwner ? (
          <div className="flex items-start gap-2.5 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>仅工作区所有者可修改这些设置。</p>
          </div>
        ) : null}

        <form
          id="workspace-form"
          onSubmit={handleSubmit(handleFormSubmit)}
          className="space-y-4"
          noValidate
        >
          <FieldWrapper
            label="工作区名称"
            icon={Building}
            error={errors.name?.message}
          >
            <input
              type="text"
              autoComplete="organization"
              disabled={!isOwner}
              {...register("name")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                "min-h-[44px]",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                errors.name ? "border-destructive" : "border-input"
              )}
              placeholder="请输入工作区名称"
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
              disabled={!isOwner}
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
            label="业务类型"
            icon={Briefcase}
            error={errors.businessType?.message}
          >
            <input
              type="text"
              disabled={!isOwner}
              {...register("businessType")}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 text-sm",
                "min-h-[44px]",
                "placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                errors.businessType ? "border-destructive" : "border-input"
              )}
              placeholder="例如：租赁中介、新房代理、商业地产"
            />
          </FieldWrapper>
        </form>
      </SettingsFormCard>
    </section>
  );
}
