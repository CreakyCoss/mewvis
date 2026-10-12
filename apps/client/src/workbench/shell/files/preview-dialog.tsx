import type { ReactNode } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Button } from "design-system/components/ui/button";
import type { ApplicationFilePreview } from "@mewvis/app-sdk/files";

export function FilePreviewDialog({
  preview,
  url,
  onClose,
  children,
}: {
  preview?: ApplicationFilePreview;
  url: string;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex h-[min(88vh,900px)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        aria-describedby="file-preview-description"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-14 text-left">
          <DialogTitle className="truncate text-base">{preview?.name ?? "文件预览"}</DialogTitle>
          <DialogDescription id="file-preview-description">
            只读预览 · {preview ? `${(preview.size / 1024).toFixed(1)} KB` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
          {children}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          {url && (
            <Button asChild variant="outline" size="sm">
              <a href={url} download={preview?.name} target="_blank" rel="noopener noreferrer">
                <Download className="size-4" />
                打开原文件
              </a>
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            关闭
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
