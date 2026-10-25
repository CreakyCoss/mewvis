import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  File,
  FolderOpen,
  Image,
  Loader2,
  Maximize,
  Minus,
  Music2,
  Plus,
  Video,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Button } from "design-system/components/ui/button";
import type { ApplicationFilePreview } from "@mewvis/app-sdk/files";
import { getFilePreview } from "@/api/applications/files";
import { platform } from "@/platform";

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function FilePreviewDialog({
  preview,
  url,
  onClose,
  children,
  imageScale,
  onImageScaleChange,
  onRestoreFocus,
}: {
  preview?: ApplicationFilePreview;
  url: string;
  onClose(): void;
  children: ReactNode;
  imageScale?: number;
  onImageScaleChange(scale: number | undefined): void;
  onRestoreFocus?(): void;
}) {
  const [locating, setLocating] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [actionError, setActionError] = useState("");
  const kind = preview?.kind;
  const media = kind === "image" || kind === "video" || kind === "audio";
  const Icon = kind === "image" ? Image : kind === "video" ? Video : kind === "audio" ? Music2 : File;
  const parentPath = preview?.filePath?.replace(/[^/\\]+$/, "") ?? "";
  const locate = async () => {
    if (!preview?.filePath) return;
    setActionError("");
    setLocating(true);
    try {
      if (platform.revealPath) {
        const current = await getFilePreview(preview.id);
        if (!current.filePath) throw new Error("当前文件位置不可用，请重新打开预览");
        await platform.revealPath(current.filePath);
      } else {
        await navigator.clipboard.writeText(preview.filePath);
        setCopiedId(preview.id);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setLocating(false);
    }
  };
  return (
    <Dialog
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) {
          setActionError("");
          onClose();
        }
      }}
    >
      <DialogContent
        className={`flex max-h-[90dvh] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 ${kind === "audio" ? "sm:max-w-[640px]" : "sm:max-w-[900px]"}`}
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
      >
        <DialogHeader className="flex h-14 shrink-0 flex-row items-center gap-2.5 border-b border-border/50 px-5 pr-16 text-left">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <DialogTitle className="min-w-0 truncate text-sm font-medium" title={preview?.name}>
            {preview?.name ?? "文件预览"}
          </DialogTitle>
        </DialogHeader>
        <div
          className={`relative min-h-0 overflow-auto ${kind === "audio" ? "flex items-center justify-center p-6 sm:p-8" : media ? "flex-auto" : "h-[min(65dvh,720px)]"}`}
          style={{ "--file-preview-max-height": "calc(90dvh - 9rem)" } as CSSProperties}
        >
          {children}
        </div>
        {kind === "image" && (
          <div className="pointer-events-none relative z-10 -mt-14 flex h-14 shrink-0 items-start justify-center pb-3">
            <div
              role="toolbar"
              aria-label="图片缩放"
              className="pointer-events-auto flex h-10 items-center gap-1 rounded-xl border border-border/40 bg-popover/95 px-1.5 shadow-sm backdrop-blur-md"
            >
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="缩小图片"
                disabled={imageScale !== undefined && imageScale <= 0.25}
                onClick={() => onImageScaleChange(Math.max(0.25, (imageScale ?? 1) - 0.25))}
              >
                <Minus className="size-3.5" />
              </Button>
              <button
                type="button"
                className="min-w-12 rounded-md px-1 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="以原始尺寸查看"
                onClick={() => onImageScaleChange(1)}
              >
                {imageScale === undefined ? "适应" : `${Math.round(imageScale * 100)}%`}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="放大图片"
                disabled={imageScale !== undefined && imageScale >= 3}
                onClick={() => onImageScaleChange(Math.min(3, (imageScale ?? 1) + 0.25))}
              >
                <Plus className="size-3.5" />
              </Button>
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="适应窗口"
                onClick={() => onImageScaleChange(undefined)}
              >
                <Maximize className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-popover px-5 py-3">
          <div className="min-w-0 flex-1 basis-32">
            <DialogDescription className="text-xs">
              {preview
                ? `${preview.name.split(".").pop()?.toUpperCase() ?? preview.kind} · ${sizeText(preview.size)}`
                : "只读预览"}
            </DialogDescription>
            {parentPath && (
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" title={parentPath}>
                <FolderOpen aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate" dir="auto">
                  {parentPath}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {preview?.filePath && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-primary/8 text-primary hover:bg-primary/15"
                disabled={locating}
                onClick={() => void locate()}
              >
                {locating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : copiedId === preview.id ? (
                  <Check className="size-4" />
                ) : platform.revealPath ? (
                  <FolderOpen className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {platform.revealPath ? "打开所在目录" : copiedId === preview.id ? "已复制路径" : "复制文件路径"}
              </Button>
            )}
            {url && (
              <Button asChild variant="outline" size="icon" className="size-8" title="打开原文件">
                <a href={url} target="_blank" rel="noopener noreferrer" aria-label="打开原文件">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            )}
          </div>
          {actionError && (
            <p role="alert" className="w-full break-words text-xs text-destructive">
              {actionError}
            </p>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
