import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { closeFilePreview, type FilePreview as FilePreviewResource } from "@/api/applications/files";
import type { ApplicationFilePreview } from "@mewvis/app-sdk/files";
import { listen } from "@/transport";
import { cn } from "design-system/lib/utils";
import { useFilePreview } from "./use-file-preview";
import { FilePreviewDialog } from "./preview-dialog";
import { renderFilePreview } from "@mewvis/app-sdk/files/view";
import type { FilePreviewProps } from "./types";
export type { FilePreviewProps } from "./types";

/** Shared non-modal entry point for dialogs, pages and side panels. */
export function FilePreview({ className, onReady, ...source }: FilePreviewProps) {
  const { resource, url, loading, error, onError } = useFilePreview(source);
  useEffect(() => {
    if (resource && url) onReady?.(resource, url);
  }, [resource, url, onReady]);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!resource || !container.current) return;
    const view = renderFilePreview(container.current, resource, { onError: (error) => onError(error.message) });
    return () => view.close();
  }, [resource, onError]);
  return (
    <div
      className={cn("relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-auto", className)}
      aria-busy={loading}
    >
      {loading && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="正在加载预览" />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div ref={container} className={cn("h-full w-full", (loading || error) && "hidden")} />
    </div>
  );
}

/** Owns only the global dialog's requests and lease lifecycle. */
export function FilePreviewHost() {
  const active = useRef<string | undefined>(undefined);
  const [preview, setPreview] = useState<ApplicationFilePreview>();
  const [url, setUrl] = useState("");
  const ready = useCallback((_resource: FilePreviewResource, originalUrl: string) => setUrl(originalUrl), []);
  const close = () => {
    const id = active.current;
    active.current = undefined;
    setPreview(undefined);
    setUrl("");
    if (id) void closeFilePreview(id).catch(() => {});
  };
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    void Promise.allSettled([
      listen<ApplicationFilePreview>("application-file-preview:open", ({ payload }) => {
        if (disposed) return;
        if (active.current) void closeFilePreview(active.current).catch(() => {});
        active.current = payload.id;
        setPreview(payload);
        setUrl("");
      }),
      listen<{ id: string }>("application-file-preview:close", ({ payload }) => {
        if (active.current === payload.id) {
          active.current = undefined;
          setPreview(undefined);
          setUrl("");
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
  return (
    <FilePreviewDialog preview={preview} url={url} onClose={close}>
      {preview && <FilePreview key={preview.id} previewId={preview.id} onReady={ready} />}
    </FilePreviewDialog>
  );
}
