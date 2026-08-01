"use client";

import * as React from "react";
import {
  FileText,
  Download,
  Trash2,
  Bot,
  Loader2,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { SettingsSection } from "@/components/ui/settings-section";
import { SettingsFormCard } from "@/components/ui/settings-form-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

// --- Types ---

export interface PrivacySectionProps {
  /** Privacy policy URL to link to */
  privacyPolicyUrl?: string;
  /** Handler for data export */
  onExportData: () => Promise<{ error?: string; success?: boolean }>;
  /** Handler for account deletion */
  onDeleteAccount: () => Promise<{ error?: string; success?: boolean }>;
  /** Whether data export is in progress */
  isExporting?: boolean;
  /** Whether account deletion is in progress */
  isDeleting?: boolean;
}

// --- Component ---

export function PrivacySection({
  privacyPolicyUrl = "/privacy-policy",
  onExportData,
  onDeleteAccount,
  isExporting = false,
  isDeleting = false,
}: PrivacySectionProps) {
  const [exportStatus, setExportStatus] = React.useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleExport = async () => {
    setExportStatus({ type: "loading" });

    try {
      const result = await onExportData();

      if (result.error) {
        setExportStatus({ type: "error", message: result.error });
      } else {
        setExportStatus({ type: "success", message: "数据导出请求已提交，我们将尽快处理。" });
        // Auto-dismiss success
        setTimeout(
          () => setExportStatus({ type: "idle" }),
          5000
        );
      }
    } catch {
      setExportStatus({
        type: "error",
        message: "导出请求失败，请重试",
      });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const result = await onDeleteAccount();

      if (result.error) {
        setDeleteError(result.error);
      } else {
        // Account deletion is handled by server (redirects, etc.)
        setShowDeleteConfirm(false);
      }
    } catch {
      setDeleteError("删除请求失败，请重试");
    }
  };

  return (
    <div className="space-y-6">
      {/* Privacy Policy */}
      <SettingsSection title="隐私与数据" description="管理您的隐私设置和数据">
        <SettingsFormCard
          title="隐私政策"
          description="了解我们如何收集、使用和保护您的个人信息"
        >
          <a
            href={privacyPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2.5",
              "text-sm font-medium transition-colors",
              "min-h-[44px]",
              "text-primary hover:bg-secondary",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            )}
          >
            <FileText className="h-5 w-5" />
            查看隐私政策
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </a>
        </SettingsFormCard>
      </SettingsSection>

      {/* Data Export */}
      <SettingsSection>
        <SettingsFormCard
          title="数据导出"
          description="导出您的个人数据和在工作区中的活动记录"
        >
          <div className="space-y-3">
            {exportStatus.type === "error" ? (
              <p className="text-sm text-destructive" role="alert">
                {exportStatus.message}
              </p>
            ) : exportStatus.type === "success" ? (
              <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                {exportStatus.message}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleExport}
              disabled={exportStatus.type === "loading" || isExporting}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2.5",
                "text-sm font-medium transition-colors",
                "min-h-[44px]",
                "border bg-background hover:bg-secondary",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {exportStatus.type === "loading" || isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  导出我的数据
                </>
              )}
            </button>
          </div>
        </SettingsFormCard>
      </SettingsSection>

      {/* AI Preferences Placeholder */}
      <SettingsSection>
        <SettingsFormCard
          title="AI 偏好设置"
          description="管理 AI 学习到的个人偏好（即将开放）"
        >
          <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            <Bot className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">即将开放</p>
              <p className="mt-0.5">
                AI 偏好学习功能将在后续版本中提供。届时您可以查看和调整
                AI 基于您的操作习惯学习到的偏好设置。
              </p>
            </div>
          </div>
        </SettingsFormCard>
      </SettingsSection>

      {/* Account Deletion */}
      <SettingsSection>
        <SettingsFormCard
          title="删除账号"
          description="永久删除您的账号和所有相关数据。此操作不可撤销。"
        >
          <div className="space-y-3">
            {deleteError ? (
              <p className="text-sm text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setShowDeleteConfirm(true);
              }}
              disabled={isDeleting}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2.5",
                "text-sm font-medium transition-colors",
                "min-h-[44px]",
                "border border-destructive/30 bg-background text-destructive hover:bg-destructive/5",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  删除我的账号
                </>
              )}
            </button>
          </div>
        </SettingsFormCard>
      </SettingsSection>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }
        }}
        title="删除账号"
        description="确定要永久删除您的账号吗？此操作会软删除您的账号和所有关联数据，删除后将无法恢复。我们建议您先导出数据。"
        confirmLabel="确认删除"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
