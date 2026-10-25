import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { closeFilePreview, getFilePreview } from "@/api/applications/files";
import type { ApplicationFilePreview } from "@mewvis/app-sdk/files";
import { Media } from "@/components/media";
import { listen } from "@/transport";
import { cn } from "design-system/lib/utils";
import { useFilePreview } from "./use-file-preview";
import { platform } from "@/platform";
import type { FilePreviewProps } from "./types";
export type { FilePreviewProps } from "./types";

/** Shared non-modal entry point for dialogs, pages and side panels. */
export function FilePreview({
  className,
  onReady,
  onError: reportError,
  layout,
  imageScale,
  mediaControls,
  onMediaReady,
  onMediaStateChange,
  onMetadata,
  ...source
}: FilePreviewProps) {
  const { resource, url, loading, error, onError } = useFilePreview(source);
  useEffect(() => {
    if (error) reportError?.(error);
  }, [error, reportError]);
  useEffect(() => {
    if (resource && url) onReady?.(resource, url);
  }, [resource, url, onReady]);
  return (
    <div
      className={cn(
        "relative flex w-full min-h-0 min-w-0 overflow-auto",
        layout === "intrinsic" ? "h-auto" : "h-full",
        className,
      )}
      style={{ alignItems: "safe center", justifyContent: "safe center" }}
      aria-busy={loading}
    >
      {loading && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="正在加载预览" />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {resource && !error && (
        <Media
          resource={resource}
          presentation="preview"
          layout={layout}
          imageScale={imageScale}
          mediaControls={mediaControls}
          onMediaReady={onMediaReady}
          onMediaStateChange={onMediaStateChange}
          onMetadata={onMetadata}
          onError={onError}
        />
      )}
    </div>
  );
}

/** Owns only the global dialog's requests and lease lifecycle. */
export function FilePreviewHost() {
  const active = useRef<string | undefined>(undefined);
  const focusTarget = useRef<HTMLElement | null>(null);
  const [preview, setPreview] = useState<ApplicationFilePreview>();
  const close = () => {
    const id = active.current;
    active.current = undefined;
    setPreview(undefined);
    if (id) void closeFilePreview(id).catch(() => {});
  };
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    void Promise.allSettled([
      listen<ApplicationFilePreview>("application-file-preview:open", ({ payload }) => {
        if (disposed) return;
        if (!active.current)
          focusTarget.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (active.current) void closeFilePreview(active.current).catch(() => {});
        active.current = payload.id;
        setPreview(payload);
      }),
      listen<{ id: string }>("application-file-preview:close", ({ payload }) => {
        if (active.current === payload.id) {
          active.current = undefined;
          setPreview(undefined);
        }
      }),
    ]).then((values) => {
      for (const result of values) {
        if (result.status === "fulfilled") {
          if (disposed) result.value();
          else unlisteners.push(result.value);
        }
      }
    });
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
      if (active.current) void closeFilePreview(active.current).catch(() => {});
      active.current = undefined;
    };
  }, []);
  return preview ? (
    <HostMediaDialog
      key={preview.id}
      preview={preview}
      onClose={close}
      onRestoreFocus={() => {
        if (focusTarget.current?.isConnected) focusTarget.current.focus({ preventScroll: true });
      }}
    />
  ) : null;
}

/** Resource/capability adapter only; Media owns all dialog content, actions and view state. */
function HostMediaDialog({
  preview,
  onClose,
  onRestoreFocus,
}: {
  preview: ApplicationFilePreview;
  onClose(): void;
  onRestoreFocus(): void;
}) {
  const { resource, loading, error } = useFilePreview({ previewId: preview.id });
  const reveal = platform.revealPath
    ? async () => {
        const current = await getFilePreview(preview.id);
        if (!current.filePath) throw new Error("当前文件位置不可用，请重新打开预览");
        await platform.revealPath!(current.filePath);
      }
    : undefined;
  return (
    <Media
      presentation="dialog"
      preview={preview}
      resource={resource}
      loading={loading}
      error={error}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onReveal={reveal}
    />
  );
}
