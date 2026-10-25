import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { closeFilePreview, type FilePreview as FilePreviewResource } from "@/api/applications/files";
import type { ApplicationFilePreview, FilePreviewMediaControls, FilePreviewMediaState } from "@mewvis/app-sdk/files";
import { AudioPlayer } from "design-system/components/audio-player";
import { listen } from "@/transport";
import { cn } from "design-system/lib/utils";
import { useFilePreview } from "./use-file-preview";
import { FilePreviewDialog } from "./preview-dialog";
import { renderFilePreview } from "@mewvis/app-sdk/files/view";
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
  ...source
}: FilePreviewProps) {
  const { resource, url, loading, error, onError } = useFilePreview(source);
  useEffect(() => {
    if (error) reportError?.(error);
  }, [error, reportError]);
  useEffect(() => {
    if (resource && url) onReady?.(resource, url);
  }, [resource, url, onReady]);
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onMediaReady, onMediaStateChange });
  callbacks.current = { onMediaReady, onMediaStateChange };
  useEffect(() => {
    if (!resource || !container.current) return;
    const view = renderFilePreview(container.current, resource, {
      layout,
      imageScale,
      mediaControls,
      onMediaReady: (controls) => callbacks.current.onMediaReady?.(controls),
      onMediaStateChange: (state) => callbacks.current.onMediaStateChange?.(state),
      onError: (error) => onError(error.message),
    });
    return () => view.close();
  }, [resource, onError, layout, imageScale, mediaControls]);
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
      <div
        ref={container}
        className={cn(
          layout === "intrinsic" ? "h-auto w-fit max-w-full" : "h-full w-full",
          imageScale !== undefined && "max-w-none",
          (loading || error) && "hidden",
        )}
      />
    </div>
  );
}

/** Owns only the global dialog's requests and lease lifecycle. */
export function FilePreviewHost() {
  const active = useRef<string | undefined>(undefined);
  const focusTarget = useRef<HTMLElement | null>(null);
  const [preview, setPreview] = useState<ApplicationFilePreview>();
  const [url, setUrl] = useState("");
  const [imageScale, setImageScale] = useState<number>();
  const controls = useRef<FilePreviewMediaControls | null>(null);
  const [playback, setPlayback] = useState<FilePreviewMediaState>({
    currentTime: 0,
    duration: 0,
    paused: true,
    ended: false,
  });
  const [playbackError, setPlaybackError] = useState("");
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
        if (!active.current)
          focusTarget.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (active.current) void closeFilePreview(active.current).catch(() => {});
        active.current = payload.id;
        setPreview(payload);
        setUrl("");
        setImageScale(undefined);
        setPlayback({ currentTime: 0, duration: 0, paused: true, ended: false });
        setPlaybackError("");
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
    <FilePreviewDialog
      preview={preview}
      url={url}
      onClose={close}
      imageScale={imageScale}
      onImageScaleChange={setImageScale}
      onRestoreFocus={() => {
        if (focusTarget.current?.isConnected) focusTarget.current.focus({ preventScroll: true });
      }}
    >
      {preview && (
        <FilePreview
          key={preview.id}
          previewId={preview.id}
          onReady={ready}
          layout={["image", "audio", "video"].includes(preview.kind) ? "intrinsic" : "contain"}
          imageScale={imageScale}
          mediaControls={preview.kind !== "audio"}
          onMediaReady={(value) => {
            controls.current = value;
          }}
          onMediaStateChange={setPlayback}
          onError={setPlaybackError}
          className={preview.kind === "audio" ? "hidden" : imageScale !== undefined ? "overflow-visible" : undefined}
        />
      )}
      {preview?.kind === "audio" && (
        <div className="w-full max-w-xl">
          <AudioPlayer
            label={preview.name}
            {...playback}
            disabled={!url}
            onSeek={(seconds) => controls.current?.seek(seconds)}
            onMute={() => controls.current?.setMuted?.(!playback.muted)}
            onToggle={() => {
              setPlaybackError("");
              if (playback.paused)
                void controls.current?.play().catch((error) => setPlaybackError(String(error.message ?? error)));
              else controls.current?.pause();
            }}
          />
          {playbackError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {playbackError}
            </p>
          )}
        </div>
      )}
    </FilePreviewDialog>
  );
}
