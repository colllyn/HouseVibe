"use client";

import * as React from "react";
import { Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function DeletePropertyButton({ propertyId }: { propertyId: string }) {
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const resp = await fetch(`/api/properties/${propertyId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: "删除失败" }));
        setError(body.error ?? "删除失败");
        setIsDeleting(false);
        return;
      }
      window.location.href = "/properties";
    } catch {
      setError("删除失败，请重试");
      setIsDeleting(false);
    }
  };

  if (isConfirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          data-testid="property-delete-confirm"
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-2",
            "text-sm font-medium",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            "min-h-[44px] transition-colors",
            "disabled:opacity-50"
          )}
        >
          {isDeleting ? (
            <><Loader2 className="h-4 w-4 animate-spin" />删除中...</>
          ) : (
            "确认删除"
          )}
        </button>
        <button
          type="button"
          onClick={() => { setIsConfirming(false); setError(null); }}
          disabled={isDeleting}
          data-testid="property-delete-cancel"
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-2",
            "text-sm font-medium border border-input",
            "hover:bg-muted min-h-[44px] transition-colors",
            "disabled:opacity-50"
          )}
        >
          取消
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsConfirming(true)}
      data-testid="property-delete-button"
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-2",
        "text-sm font-medium border border-input",
        "text-destructive hover:bg-destructive/10",
        "min-h-[44px] transition-colors"
      )}
    >
      <Trash2 className="h-4 w-4" />
      删除
    </button>
  );
}
