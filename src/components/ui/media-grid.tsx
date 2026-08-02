"use client";

import * as React from "react";
import {
  Image,
  Star,
  Trash2,
  ChevronUp,
  ChevronDown,
  Upload,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaItem {
  id: string;
  propertyId: string;
  storagePath: string;
  mediaType: "image";
  sceneTag: string | null;
  isCover: boolean;
  sortOrder: number;
  width: number | null;
  height: number | null;
  signedUrl: string;
  signedUrlExpiresAt: string;
  createdAt: string;
}

interface MediaListResponse {
  data: {
    media: MediaItem[];
    total: number;
  };
  error: null;
}

// ---------------------------------------------------------------------------
// fetchMedia helper
// ---------------------------------------------------------------------------

async function fetchMedia(propertyId: string, signal?: AbortSignal): Promise<MediaItem[]> {
  const resp = await fetch(`/api/properties/${propertyId}/media`, {
    credentials: "include",
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || "加载图片列表失败");
  }
  const json: MediaListResponse = await resp.json();
  return json.data.media;
}

// ---------------------------------------------------------------------------
// ImageWithFallback
// ---------------------------------------------------------------------------

function ImageWithFallback({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = React.useState(false);

  if (hasError || !src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className
        )}
      >
        <Image className="h-8 w-8 opacity-40" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton Grid
// ---------------------------------------------------------------------------

export function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media Grid
// ---------------------------------------------------------------------------

export interface MediaGridProps {
  propertyId: string;
  /** Refresh counter — increment to trigger re-fetch */
  refreshKey?: number;
  listElt?: "section" | "div";
  className?: string;
}

export function MediaGrid({ propertyId, refreshKey = 0, listElt = "section", className }: MediaGridProps) {
  const [media, setMedia] = React.useState<MediaItem[]>([]);
  const [status, setStatus] = React.useState<"loading" | "error" | "success">("loading");
  const [errorMessage, setErrorMessage] = React.useState<string>("");

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = React.useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Full-size image viewer
  const [viewerImage, setViewerImage] = React.useState<MediaItem | null>(null);

  // --- Data fetching --------------------------------------------------------

  const loadMedia = React.useCallback(
    async (signal?: AbortSignal) => {
      setStatus("loading");
      setErrorMessage("");
      try {
        const items = await fetchMedia(propertyId, signal);
        setMedia(items);
        setStatus("success");
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorMessage(err instanceof Error ? err.message : "加载失败");
        setStatus("error");
      }
    },
    [propertyId]
  );

  React.useEffect(() => {
    const ac = new AbortController();
    loadMedia(ac.signal);
    return () => ac.abort();
  }, [loadMedia, refreshKey]);

  // --- Sort actions ---------------------------------------------------------

  async function moveMedia(index: number, direction: "up" | "down") {
    const items = [...media];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const current = items[index];
    const neighbor = items[targetIndex];
    if (!current || !neighbor) return;

    const newSortOrder =
      current.sortOrder === neighbor.sortOrder
        ? direction === "up"
          ? Math.max(0, neighbor.sortOrder - 1)
          : neighbor.sortOrder + 1
        : neighbor.sortOrder;

    // Optimistic update
    const updated = items.map((m) =>
      m.id === current.id ? { ...m, sortOrder: newSortOrder } : m
    );
    // Re-sort locally
    updated.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    setMedia(updated);

    try {
      await fetch(`/api/properties/${propertyId}/media/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sortOrder: newSortOrder }),
      });
    } catch {
      // Revert on failure by reloading
      loadMedia();
    }
  }

  // --- Cover toggle ---------------------------------------------------------

  async function setCover(item: MediaItem) {
    if (item.isCover) return; // already cover

    // Optimistic update
    setMedia((prev) =>
      prev.map((m) => ({ ...m, isCover: m.id === item.id }))
    );

    try {
      await fetch(`/api/properties/${propertyId}/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isCover: true }),
      });
    } catch {
      loadMedia();
    }
  }

  // --- Delete ---------------------------------------------------------------

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);

    try {
      const resp = await fetch(
        `/api/properties/${propertyId}/media/${deleteTarget.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: "删除失败" }));
        throw new Error(body.error ?? "删除失败");
      }
      setMedia((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // error is shown on the dialog button area
    } finally {
      setIsDeleting(false);
    }
  }

  // --- Render ---------------------------------------------------------------

  const Wrapper = listElt;

  if (status === "loading") {
    return <Wrapper className={cn("space-y-3", className)}><MediaGridSkeleton /></Wrapper>;
  }

  if (status === "error") {
    return (
      <Wrapper className={className}>
        <ErrorState
          title="加载图片失败"
          description={errorMessage || "请检查网络后重试"}
          onRetry={() => loadMedia()}
        />
      </Wrapper>
    );
  }

  if (media.length === 0) {
    return (
      <Wrapper className={className}>
        <EmptyState
          icon={<Upload className="h-12 w-12" />}
          title="暂无图片"
          description="点击上方上传"
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper className={cn("space-y-3", className)}>
      {/* Grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        role="list"
        aria-label="房源图片列表"
      >
        {media.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === media.length - 1;

          return (
            <div
              key={item.id}
              role="listitem"
              className="group relative rounded-lg border bg-background overflow-hidden"
            >
              {/* Thumbnail */}
              <button
                type="button"
                onClick={() => setViewerImage(item)}
                className="block w-full aspect-square overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-t-lg"
                aria-label={`查看大图：${item.sceneTag ?? "图片"} ${index + 1}`}
              >
                <ImageWithFallback
                  src={item.signedUrl}
                  alt={item.sceneTag ?? `图片 ${index + 1}`}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                {/* Hover overlay — view larger */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>
              </button>

              {/* Cover badge */}
              {item.isCover && (
                <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow">
                  <Star className="h-3 w-3 fill-current" />
                  封面
                </div>
              )}

              {/* Action bar */}
              <div className="flex items-center justify-between gap-1 p-1.5 border-t">
                {/* Sort controls */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveMedia(index, "up")}
                    disabled={isFirst}
                    aria-label="向上移动"
                    className={cn(
                      "inline-flex items-center justify-center h-9 w-9 rounded",
                      "text-muted-foreground hover:bg-muted transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                      "disabled:opacity-30 disabled:cursor-not-allowed"
                    )}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMedia(index, "down")}
                    disabled={isLast}
                    aria-label="向下移动"
                    className={cn(
                      "inline-flex items-center justify-center h-9 w-9 rounded",
                      "text-muted-foreground hover:bg-muted transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                      "disabled:opacity-30 disabled:cursor-not-allowed"
                    )}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Cover toggle + Delete */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setCover(item)}
                    disabled={item.isCover}
                    aria-label={item.isCover ? "已是封面" : "设为封面"}
                    className={cn(
                      "inline-flex items-center justify-center h-9 w-9 rounded",
                      "transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      item.isCover
                        ? "text-yellow-500"
                        : "text-muted-foreground hover:text-yellow-500 hover:bg-muted"
                    )}
                  >
                    <Star
                      className={cn("h-4 w-4", item.isCover && "fill-current")}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    aria-label={`删除 ${item.sceneTag ?? "图片"}`}
                    className={cn(
                      "inline-flex items-center justify-center h-9 w-9 rounded",
                      "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                      "transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除图片"
        description={deleteTarget ? `确定要删除这张图片吗？` : ""}
        confirmLabel="删除"
        cancelLabel="取消"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      {/* Full-size image viewer */}
      <Dialog open={viewerImage !== null} onOpenChange={(open) => {
        if (!open) setViewerImage(null);
      }}>
        <DialogContent className="max-w-[90vw] max-h-[90dvh] p-2 sm:p-4">
          {viewerImage && (
            <div className="flex flex-col items-center gap-3">
              <ImageWithFallback
                src={viewerImage.signedUrl}
                alt={viewerImage.sceneTag ?? "房源图片"}
                className="max-h-[75dvh] w-auto max-w-full rounded object-contain"
              />
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {viewerImage.isCover && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <Star className="h-3 w-3 fill-current" />
                    封面图片
                  </span>
                )}
                {viewerImage.width && viewerImage.height && (
                  <span>{viewerImage.width} x {viewerImage.height}</span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Wrapper>
  );
}

// ---------------------------------------------------------------------------
// CoverImage — hero display for detail pages
// ---------------------------------------------------------------------------

export interface CoverImageProps {
  propertyId: string;
  className?: string;
}

export function CoverImage({ propertyId, className }: CoverImageProps) {
  const [coverItem, setCoverItem] = React.useState<MediaItem | null | undefined>(undefined);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    const ac = new AbortController();
    fetchMedia(propertyId, ac.signal)
      .then((items) => {
        const cover = items.find((m) => m.isCover) ?? items[0] ?? null;
        setCoverItem(cover);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError(true);
      });
    return () => ac.abort();
  }, [propertyId]);

  return (
    <div className={cn("aspect-video bg-muted rounded-lg overflow-hidden", className)}>
      {coverItem === undefined ? (
        // Loading
        <div className="h-full w-full animate-pulse bg-muted-foreground/10" />
      ) : coverItem === null || loadError ? (
        // No media or error — fallback
        <div className="h-full w-full flex items-center justify-center">
          <Image className="h-16 w-16 text-muted-foreground/30" />
        </div>
      ) : (
        // Has cover
        <ImageWithFallback
          src={coverItem.signedUrl}
          alt="封面图片"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
