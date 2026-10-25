import { useEffect, useRef, useState } from "react";
import { Loader2Icon, VideoIcon } from "lucide-react";
import { writeClipboardText } from "@mewvis/app-sdk/browser";
import { HoverCard, HoverCardArrow, HoverCardContent, HoverCardTrigger } from "design-system/components/ui/hover-card";
import { Button } from "design-system/components/ui/button";
import { cn } from "design-system/lib/utils";
import { MediaInfo } from "./info";
import { errorText, getMediaLabels, inferType } from "./util";
import { AudioRenderer } from "./renderers/audio";
import { useMediaRuntime } from "./runtime";
import { useMediaPreview } from "./use-media";
import type { MediaContentProps } from "./types";

/** Private inline/body composition selected by the public Media facade. */
export function MediaView(props: MediaContentProps) {
  const hintType = inferType(props);
  const { resource, presentation = "inline", imageScale } = props;
  const inline = presentation === "inline";
  // Source metadata may arrive after mounting. It must not reopen the lease just
  // to change the renderer's layout or native audio/video controls.
  const layout = props.layout ?? (inline || ["image", "audio", "video"].includes(hintType) ? "intrinsic" : "contain");
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const getRuntime = useMediaRuntime();
  const [revision, setRevision] = useState(0);
  const media = useMediaPreview({ ...props, layout }, root, revision);
  const type = media.metadata?.kind ?? hintType;
  const audio = type === "audio";
  const visual = type === "image" || type === "video";
  const path = media.metadata?.filePath ?? resource?.filePath ?? props.filePath ?? "";
  const name = props.name ?? media.metadata?.name ?? (path.split(/[\\/]/).at(-1) || "媒体文件");
  const labels = getMediaLabels(type, props.formatLabel);
  const label = labels.accessible;
  const size = media.metadata?.size ?? props.size;
  const mimeType = media.metadata?.mimeType ?? props.mimeType;
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number }>();
  const [small, setSmall] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRequest = useRef(false);
  let canReveal = false;
  try {
    canReveal = Boolean(getRuntime().reveal);
  } catch {
    /* Loading reports an unavailable host. */
  }

  useEffect(() => {
    if (!stage.current || media.loading || !media.visible) return;
    const measure = () => {
      const { width, height } = stage.current!.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setMediaSize((previous) =>
          previous?.width === width && previous.height === height ? previous : { width, height },
        );
        setSmall(visual && (width < 280 || height < 88));
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [media.loading, media.visible, visual]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    setActionError("");
    setCopied(false);
    setMediaSize(undefined);
    setSmall(false);
    setInfoOpen(false);
  }, [path, resource?.id]);

  const open = async () => {
    if (!path || openingRequest.current) return;
    openingRequest.current = true;
    setOpening(true);
    setActionError("");
    root.current?.focus({ preventScroll: true });
    try {
      await getRuntime().openDialog({ filePath: path });
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      openingRequest.current = false;
      setOpening(false);
    }
  };
  const locate = async () => {
    setActionError("");
    try {
      const reveal = getRuntime().reveal;
      if (reveal) await reveal(path);
      else {
        await writeClipboardText(path);
        setCopied(true);
      }
    } catch (error) {
      setActionError(errorText(error));
    }
  };
  const info = (stacked = false) => (
    <MediaInfo
      name={name}
      type={type}
      size={size}
      label={label}
      stacked={stacked}
      canReveal={canReveal}
      copied={copied}
      opening={opening}
      onLocate={() => void locate()}
      onOpen={() => void open()}
    />
  );
  const retainFocusedInfo = (nextOpen: boolean) => {
    const focused = root.current?.ownerDocument.activeElement;
    if (nextOpen || (!root.current?.contains(focused ?? null) && !popover.current?.contains(focused ?? null)))
      setInfoOpen(nextOpen);
  };

  return (
    <HoverCard
      open={inline && small && !media.loading && !media.error && infoOpen}
      onOpenChange={retainFocusedInfo}
      openDelay={100}
      closeDelay={180}
    >
      <HoverCardTrigger asChild>
        <figure
          ref={root}
          tabIndex={inline ? 0 : undefined}
          aria-label={label}
          aria-busy={media.loading}
          data-slot="media"
          data-media-kind={type}
          data-media-mime-type={mimeType}
          data-media-size={size}
          data-media-small={small || undefined}
          data-presentation={presentation}
          className={cn(
            "media-root relative min-w-0 max-w-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
            audio ? "w-[28rem]" : layout === "contain" ? "h-full w-full" : "w-fit",
            imageScale !== undefined && "max-w-none shrink-0",
            props.className,
          )}
          style={
            !media.visible && mediaSize
              ? { width: mediaSize.width, height: mediaSize.height }
              : media.loading || !mediaSize
                ? { minWidth: "min(100%, 16rem)", minHeight: audio ? (inline ? 104 : 56) : 96 }
                : undefined
          }
          onFocusCapture={() => setInfoOpen(true)}
          onBlurCapture={() => requestAnimationFrame(() => retainFocusedInfo(false))}
          onKeyDown={(event) => {
            if (inline && small && event.target === root.current && event.key === "Tab" && !event.shiftKey) {
              const action = popover.current?.querySelector("button");
              if (action) {
                event.preventDefault();
                action.focus();
              }
            }
            if (inline && event.target === root.current && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              void open();
            }
          }}
        >
          <div
            ref={stage}
            className={cn(
              "relative min-w-0 max-w-full",
              audio ? "rounded-xl bg-primary/8" : "overflow-hidden rounded-lg",
              type === "video" && inline && "border border-border/80 bg-muted/60",
              layout === "contain" && "h-full",
              imageScale !== undefined && "max-w-none",
            )}
          >
            {audio && inline && !media.error && info(true)}
            {type === "video" && inline && !media.error && labels.visible && (
              <span className="media-kind pointer-events-none absolute top-2.5 left-2.5 z-10 inline-flex max-w-[calc(100%-1.25rem)] items-center gap-1.5 rounded-md border border-border/50 bg-popover/90 px-2 py-1 text-[11px] text-muted-foreground">
                <VideoIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{labels.visible}</span>
              </span>
            )}
            <div
              ref={media.container}
              aria-label={`${label}预览`}
              aria-hidden={audio || Boolean(media.error)}
              className={cn(
                audio ? "hidden" : layout === "contain" ? "h-full w-full" : "w-fit max-w-full",
                imageScale !== undefined && "max-w-none",
              )}
            />
            {audio && !media.error && (
              <AudioRenderer
                label={name}
                {...media.playback}
                disabled={media.loading || !media.controls.current}
                onSeek={(seconds) => media.controls.current?.seek(seconds)}
                onMute={() => media.controls.current?.setMuted?.(!media.playback.muted)}
                onToggle={() => {
                  setActionError("");
                  if (media.playback.paused)
                    void media.controls.current?.play().catch((error) => setActionError(errorText(error)));
                  else media.controls.current?.pause();
                }}
              />
            )}
            {media.loading && !audio && (
              <p
                role="status"
                className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground"
              >
                <Loader2Icon className="size-4 animate-spin" />
                正在加载预览
              </p>
            )}
            {media.error && (
              <div className="min-w-0 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <p role="alert" className="break-words text-xs text-muted-foreground">
                  {media.error}
                </p>
                <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
                  重新加载
                </Button>
              </div>
            )}
            {inline && type === "image" && !media.loading && !media.error && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`放大预览${label}`}
                onClick={() => void open()}
                className="absolute inset-0 cursor-zoom-in rounded-lg outline-none"
              />
            )}
            {inline && visual && !small && !media.loading && !media.error && (
              <figcaption
                aria-label={`${label}文件信息`}
                className="media-hover media-overlay absolute top-2.5 right-2.5 left-2.5 z-20 overflow-hidden rounded-lg bg-black/65 text-white backdrop-blur-md"
              >
                {info()}
              </figcaption>
            )}
          </div>
          {actionError && (
            <p role="alert" className="mt-1 break-words text-xs text-destructive">
              {actionError}
            </p>
          )}
        </figure>
      </HoverCardTrigger>
      {inline && small && (
        <HoverCardContent
          ref={popover}
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="media-popover w-80 max-w-[calc(100vw-1.5rem)] p-0"
          onFocusCapture={() => setInfoOpen(true)}
          onBlurCapture={() => requestAnimationFrame(() => retainFocusedInfo(false))}
        >
          {info(true)}
          <HoverCardArrow width={12} height={6} />
        </HoverCardContent>
      )}
    </HoverCard>
  );
}
