"use client";

import * as React from "react";
import { Upload, X, AlertCircle, Loader2, ImagePlus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

type FileStatus = "pending" | "uploading" | "success" | "error";

interface UploadFile {
  id: string;
  file: File;
  preview: string;
  status: FileStatus;
  progress: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return "不支持的格式，仅支持 PNG、JPEG、WebP、GIF";
  }
  if (file.size > MAX_FILE_SIZE) {
    return `文件过大（${formatSize(file.size)}），上限 10 MB`;
  }
  return null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MediaUploaderProps {
  propertyId: string;
  onSuccess?: () => void;
  className?: string;
}

export function MediaUploader({ propertyId, onSuccess, className }: MediaUploaderProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);

  const [files, setFiles] = React.useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  // Cleanup preview URLs on unmount
  React.useEffect(() => {
    const previews = files.map((f) => f.preview);
    return () => previews.forEach((p) => URL.revokeObjectURL(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- File selection -------------------------------------------------------

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    setGlobalError(null);

    if (files.length + incoming.length > MAX_FILES) {
      setGlobalError(`最多同时上传 ${MAX_FILES} 张图片`);
      return;
    }

    const newFiles: UploadFile[] = [];

    for (const file of incoming) {
      const error = validateFile(file);
      if (error) {
        setGlobalError(error);
        return;
      }
      newFiles.push({
        id: generateId(),
        file,
        preview: URL.createObjectURL(file),
        status: "pending",
        progress: 0,
        error: null,
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
    setGlobalError(null);
  }

  // --- Drag and Drop --------------------------------------------------------

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  // --- Upload ---------------------------------------------------------------

  function uploadSingleFile(uploadFile: UploadFile): Promise<void> {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("files", uploadFile.file);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) =>
            prev.map((f) => (f.id === uploadFile.id ? { ...f, progress } : f))
          );
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id ? { ...f, status: "success", progress: 100 } : f
            )
          );
        } else {
          let errorText = "上传失败";
          try {
            const res = JSON.parse(xhr.responseText);
            errorText = res.error ?? errorText;
          } catch {
            // use default
          }
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? { ...f, status: "error", error: errorText, progress: 0 }
                : f
            )
          );
        }
        resolve();
      });

      xhr.addEventListener("error", () => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: "error", error: "网络错误", progress: 0 }
              : f
          )
        );
        resolve();
      });

      xhr.addEventListener("abort", () => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: "error", error: "上传已取消", progress: 0 }
              : f
          )
        );
        resolve();
      });

      xhr.open("POST", `/api/properties/${propertyId}/media`);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  }

  async function handleUpload() {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setGlobalError(null);

    setFiles((prev) =>
      prev.map((f) => (f.status === "pending" ? { ...f, status: "uploading" } : f))
    );

    for (const f of files) {
      if (f.status !== "uploading") continue;
      await uploadSingleFile(f);
    }

    setFiles((current) => {
      const allDone = current.every((f) => f.status !== "uploading");
      if (allDone) {
        const hasSuccess = current.some((f) => f.status === "success");
        const hasError = current.some((f) => f.status === "error");
        if (hasSuccess && onSuccess) onSuccess();
        if (hasError && !hasSuccess) {
          setGlobalError("所有文件上传均失败");
        }
      }
      return current;
    });
  }

  function retryFile(id: string) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "pending", progress: 0, error: null } : f))
    );
    setGlobalError(null);
  }

  function clearCompleted() {
    setFiles((prev) => prev.filter((f) => f.status === "pending" || f.status === "uploading"));
    setGlobalError(null);
  }

  // --- Derived state --------------------------------------------------------

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const uploadingCount = files.filter((f) => f.status === "uploading").length;
  const isUploading = uploadingCount > 0;
  const canUpload = pendingCount > 0 && !isUploading;

  // --- Render ---------------------------------------------------------------

  return (
    <div className={cn("space-y-3", className)}>
      {/* Drop zone */}
      <div
        ref={dropZoneRef}
        role="button"
        tabIndex={0}
        aria-label="点击或拖拽上传图片"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2",
          "rounded-lg border-2 border-dashed p-6 min-h-[120px]",
          "transition-colors cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_MIME.join(",")}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
          className="sr-only"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center gap-1 text-center">
          {isDragging ? (
            <>
              <ImagePlus className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium text-primary">释放以上传</span>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground/60" />
              <span className="text-sm font-medium">点击或拖拽上传</span>
              <span className="text-xs text-muted-foreground">
                支持 PNG、JPEG、WebP、GIF，单文件最大 10 MB，最多 {MAX_FILES} 张
              </span>
            </>
          )}
        </div>
      </div>

      {/* Global error */}
      {globalError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <ul className="space-y-2" role="list" aria-label="待上传文件列表">
          {files.map((f) => (
            <li
              key={f.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3",
                f.status === "error" && "border-destructive/40 bg-destructive/5"
              )}
            >
              {/* Preview thumbnail */}
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                <img
                  src={f.preview}
                  alt={f.file.name}
                  className="h-full w-full object-cover"
                />
                {f.status === "uploading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <span className="text-xs font-bold tabular-nums">{f.progress}%</span>
                  </div>
                )}
                {f.status === "success" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <span className="text-xs font-bold text-green-600">完成</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{f.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(f.file.size)}</p>

                {f.status === "uploading" && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}

                {f.status === "error" && f.error && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-destructive">{f.error}</p>
                    <button
                      type="button"
                      onClick={() => retryFile(f.id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-2 py-1",
                        "text-xs font-medium",
                        "bg-secondary hover:bg-secondary/80",
                        "min-h-[32px] transition-colors",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      )}
                    >
                      <RefreshCw className="h-3 w-3" />
                      重试
                    </button>
                  </div>
                )}
              </div>

              {/* Remove button */}
              {f.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  aria-label={`移除 ${f.file.name}`}
                  className={cn(
                    "flex-shrink-0 inline-flex items-center justify-center",
                    "h-10 w-10 rounded-md",
                    "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                    "transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Action buttons */}
      {files.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!canUpload}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5",
              "text-sm font-medium transition-colors",
              "min-h-[44px]",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isUploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />上传中...</>
            ) : (
              <>上传 {pendingCount > 0 ? `(${pendingCount})` : ""}</>
            )}
          </button>

          <button
            type="button"
            onClick={clearCompleted}
            disabled={isUploading}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5",
              "text-sm font-medium transition-colors",
              "min-h-[44px]",
              "border border-input bg-background hover:bg-secondary",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            清除已完成
          </button>
        </div>
      )}
    </div>
  );
}
