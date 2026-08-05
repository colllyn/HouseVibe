"use client";

import { useState } from "react";
import { Share2, Loader2 } from "lucide-react";
import { ResponsiveOverlay } from "@/components/ui/responsive-overlay";

interface ShareFormProps {
  propertyId: string;
  isShared: boolean;
  allowMarketingReuse: boolean;
  sharedExpiresAt: string | null;
  commissionSplit: string | null;
  onUpdated: () => void;
}

export function ShareForm({
  propertyId,
  isShared,
  allowMarketingReuse,
  sharedExpiresAt: initialExpiresAt,
  commissionSplit: initialSplit,
  onUpdated,
}: ShareFormProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sharedChecked, setSharedChecked] = useState(isShared);
  const [marketingChecked, setMarketingChecked] = useState(allowMarketingReuse);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt ?? "");
  const [commissionSplit, setCommissionSplit] = useState(initialSplit ?? "");

  async function handleShare() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedExpiresAt: expiresAt || undefined,
          allowMarketingReuse: marketingChecked,
          commissionSplit: commissionSplit || undefined,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? "共享设置失败");
        return;
      }

      setSharedChecked(true);
      onUpdated();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnshare() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/share`, { method: "DELETE" });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? "取消共享失败");
        return;
      }

      setSharedChecked(false);
      setMarketingChecked(false);
      setExpiresAt("");
      setCommissionSplit("");
      onUpdated();
      setOpen(false);
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
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors"
      >
        <Share2 className="h-4 w-4" />
        {isShared ? "共享设置" : "上架到共享库"}
      </button>

      <ResponsiveOverlay
        open={open}
        onOpenChange={setOpen}
        title="共享库设置"
        description="将房源的脱敏信息上架到共享房源池，其他门店可浏览并发起协作请求。"
      >
        <div className="space-y-5 py-2">
          {/* Share toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">上架到共享库</p>
              <p className="text-xs text-muted-foreground">其他门店可在共享池中看到房源的脱敏信息</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sharedChecked}
              onClick={() => {
                if (sharedChecked) {
                  handleUnshare();
                } else {
                  handleShare();
                }
              }}
              disabled={submitting}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
                sharedChecked ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  sharedChecked ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Marketing reuse toggle — only shown when shared */}
          <div className={`flex items-center justify-between ${!sharedChecked ? "opacity-50" : ""}`}>
            <div>
              <p className="text-sm font-medium">营销复用授权</p>
              <p className="text-xs text-muted-foreground">授权其他门店在营销内容中使用该房源信息</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={marketingChecked}
              onClick={() => setMarketingChecked(!marketingChecked)}
              disabled={!sharedChecked || submitting}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 ${
                marketingChecked ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  marketingChecked ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Expiration date */}
          <div className="space-y-1.5">
            <label htmlFor="share-expires" className="text-sm font-medium">
              共享有效期
            </label>
            <input
              id="share-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">留空表示长期有效</p>
          </div>

          {/* Commission split */}
          <div className="space-y-1.5">
            <label htmlFor="commission-split" className="text-sm font-medium">
              佣金分成说明
            </label>
            <input
              id="commission-split"
              type="text"
              value={commissionSplit}
              onChange={(e) => setCommissionSplit(e.target.value)}
              placeholder="如: 5/5 分成，需买方付佣等"
              maxLength={200}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Error display */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium border border-input hover:bg-muted min-h-[44px] transition-colors disabled:opacity-50"
            >
              关闭
            </button>
            {sharedChecked && (
              <>
                <button
                  type="button"
                  onClick={handleUnshare}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 min-h-[44px] transition-colors disabled:opacity-50"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  取消共享
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] transition-colors disabled:opacity-50"
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  保存
                </button>
              </>
            )}
          </div>
        </div>
      </ResponsiveOverlay>
    </>
  );
}
