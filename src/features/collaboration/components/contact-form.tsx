"use client";

import { useState } from "react";
import { MessageSquare, Loader2, Send } from "lucide-react";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";

interface ContactFormProps {
  propertyId: string;
  propertyTitle: string;
  disabled?: boolean;
}

export function ContactForm({ propertyId, propertyTitle, disabled }: ContactFormProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleClose() {
    setOpen(false);
    setMessage("");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit() {
    if (!message.trim()) {
      setError("请输入留言内容");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/shared-properties/${propertyId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? "请求发送失败");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <MessageSquare className="h-4 w-4" />
        联系对方
      </button>

      <ResponsiveOverlay
        open={open}
        onOpenChange={(v) => { if (!v) handleClose(); }}
        title="发起协作请求"
        description={`就房源「${propertyTitle}」向对方门店发起协作请求`}
      >
        <div className="space-y-4 py-2">
          {success ? (
            <div className="rounded-md bg-green-50 border border-green-200 px-4 py-6 text-center">
              <p className="text-sm font-medium text-green-700">请求已发送</p>
              <p className="text-xs text-green-600 mt-1">对方门店将收到通知，请耐心等待回复</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="contact-message" className="text-sm font-medium">
                  留言内容
                </label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="简要说明合作意向、佣金分配建议等..."
                  maxLength={500}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !message.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  发送请求
                </button>
              </div>
            </>
          )}
        </div>
      </ResponsiveOverlay>
    </>
  );
}
