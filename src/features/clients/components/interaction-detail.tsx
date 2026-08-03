"use client";

import * as React from "react";
import {
  Phone,
  MessageCircle,
  Users,
  Eye,
  RefreshCw,
  Handshake,
  FileText,
  AlertCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface InteractionData {
  id: string;
  workspace_id?: string;
  client_id: string;
  interaction_type: string;
  summary?: string | null;
  raw_text?: string | null;
  next_action?: string | null;
  occurred_at: string;
  property_id?: string | null;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
}

const TYPE_CONFIG = {
  phone_call: { label: "电话", icon: Phone, color: "text-blue-600 bg-blue-50" },
  wechat_message: { label: "微信", icon: MessageCircle, color: "text-green-600 bg-green-50" },
  in_person_meeting: { label: "见面", icon: Users, color: "text-purple-600 bg-purple-50" },
  property_viewing: { label: "带看", icon: Eye, color: "text-orange-600 bg-orange-50" },
  follow_up: { label: "跟进", icon: RefreshCw, color: "text-teal-600 bg-teal-50" },
  negotiation: { label: "谈判", icon: Handshake, color: "text-amber-600 bg-amber-50" },
  contract_signing: { label: "签约", icon: FileText, color: "text-red-600 bg-red-50" },
  complaint: { label: "投诉", icon: AlertCircle, color: "text-rose-600 bg-rose-50" },
  other: { label: "其他", icon: MoreHorizontal, color: "text-gray-600 bg-gray-50" },
};

interface InteractionDetailProps {
  interaction: InteractionData;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function InteractionDetail({ interaction, onEdit, onDelete, onClose }: InteractionDetailProps) {
  const [deleting, setDeleting] = React.useState(false);
  const typeInfo = TYPE_CONFIG[interaction.interaction_type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.other;
  const Icon = typeInfo.icon;

  const handleDelete = async () => {
    if (!confirm("确定要删除这条沟通记录吗？")) return;
    setDeleting(true);
    try {
      const resp = await fetch(
        `/api/clients/${interaction.client_id}/interactions/${interaction.id}`,
        { method: "DELETE" }
      );
      const json = await resp.json();
      if (!resp.ok) {
        alert(json.error?.message ?? "删除失败");
        setDeleting(false);
        return;
      }
      onDelete();
    } catch {
      alert("删除失败，请重试");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium", typeInfo.color)}>
            <Icon className="h-3.5 w-3.5" />
            {typeInfo.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Occurred at */}
        <div>
          <span className="text-xs text-muted-foreground">发生时间</span>
          <p className="text-sm mt-0.5">
            {new Date(interaction.occurred_at).toLocaleString("zh-CN")}
          </p>
        </div>

        {/* Summary */}
        {interaction.summary && (
          <div>
            <span className="text-xs text-muted-foreground">摘要</span>
            <p className="text-sm mt-0.5">{interaction.summary}</p>
          </div>
        )}

        {/* Raw text */}
        {interaction.raw_text && (
          <div>
            <span className="text-xs text-muted-foreground">详细记录</span>
            <p className="text-sm mt-0.5 whitespace-pre-wrap break-words bg-muted/50 rounded-md p-3">
              {interaction.raw_text}
            </p>
          </div>
        )}

        {/* Next action */}
        {interaction.next_action && (
          <div>
            <span className="text-xs text-muted-foreground">下一步行动</span>
            <p className="text-sm mt-0.5">{interaction.next_action}</p>
          </div>
        )}

        {/* Timestamps */}
        {interaction.created_at && (
          <div>
            <span className="text-xs text-muted-foreground">创建时间</span>
            <p className="text-sm mt-0.5">
              {new Date(interaction.created_at).toLocaleString("zh-CN")}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors flex-1 justify-center"
        >
          <Pencil className="h-4 w-4" />编辑
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-destructive text-destructive hover:bg-destructive/10 min-h-[44px] transition-colors disabled:opacity-50 flex-1 justify-center"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {deleting ? "删除中..." : "删除"}
        </button>
      </div>
    </div>
  );
}
