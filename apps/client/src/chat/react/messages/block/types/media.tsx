import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CircleAlertIcon,
  CircleHelpIcon,
  CopyIcon,
  FolderOpenIcon,
  ExpandIcon,
  ImageIcon,
  Loader2Icon,
  VideoIcon,
  Volume2Icon,
} from "lucide-react";
import { writeClipboardText } from "@mewvis/app-sdk/browser";
import {
  getApplicationFileClient,
  type FilePreviewView,
  type FilePreviewMediaControls,
  type FilePreviewMediaState,
} from "@mewvis/app-sdk/files";
import { AudioPlayer } from "design-system/components/audio-player";
import { Button } from "design-system/components/ui/button";
import type { ChatMediaArtifact, ChatMediaResult } from "@/chat/core";
import { useChatFilePreview } from "../../../provider";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const fileSize = (bytes?: number) =>
  bytes === undefined
    ? ""
    : bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function MediaArtifact({ artifact, index }: { artifact: ChatMediaArtifact; index: number }) {
  const preview = useChatFilePreview();
  const container = useRef<HTMLDivElement>(null);
  const mediaElement = useRef<HTMLElement>(null);
  const controls = useRef<FilePreviewMediaControls | null>(null);
  const [playback, setPlayback] = useState<FilePreviewMediaState>({
    currentTime: 0,
    duration: 0,
    paused: true,
    ended: false,
  });
  const [visible, setVisible] = useState(false);
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number }>();
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);
  const [opening, setOpening] = useState(false);
  const openingRequest = useRef(false);
  const [copied, setCopied] = useState(false);
  const title = `${artifact.type === "audio" ? "音频" : artifact.type === "video" ? "视频" : "图片"} ${index + 1}`;
  const audio = artifact.type === "audio";
  let reveal = preview?.reveal;
  if (!preview) {
    try {
      reveal = getApplicationFileClient().reveal;
    } catch {
      /* The preview reports unavailable hosts. */
    }
  }
  const name = artifact.filePath.split(/[\\/]/).at(-1) || title;

  useEffect(() => {
    if (!mediaElement.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLoading(true);
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "200px" },
    );
    observer.observe(mediaElement.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = mediaElement.current;
    if (!visible || loading || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0)
        setMediaSize((previous) =>
          previous?.width === width && previous.height === height ? previous : { width, height },
        );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, loading]);
  useEffect(() => {
    if (!visible || !container.current) return;
    const target = container.current;
    let disposed = false;
    let view: FilePreviewView | undefined;
    setLoading(true);
    setPreviewError("");
    void (async () => {
      view = await (preview ?? getApplicationFileClient().preview).open(
        target,
        { filePath: artifact.filePath },
        {
          layout: "intrinsic",
          mediaControls: !audio,
          onMediaReady: (value) => {
            controls.current = value;
          },
          onMediaStateChange: setPlayback,
        },
      );
      if (disposed) {
        await view.close();
        return;
      }
      await view.ready;
      if (!disposed) setLoading(false);
    })().catch((error) => {
      if (!disposed) {
        setLoading(false);
        setPreviewError(errorText(error));
      }
    });
    return () => {
      disposed = true;
      void view?.close();
    };
  }, [artifact.filePath, preview, visible, revision, audio]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const open = async () => {
    if (openingRequest.current) return;
    openingRequest.current = true;
    setOpening(true);
    setActionError("");
    try {
      await (preview ?? getApplicationFileClient().preview).openDialog({ filePath: artifact.filePath });
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      openingRequest.current = false;
      setOpening(false);
    }
  };
  const copy = async () => {
    setActionError("");
    try {
      await writeClipboardText(artifact.filePath);
      setCopied(true);
    } catch (error) {
      setActionError(errorText(error));
    }
  };
  const locate = async () => {
    setActionError("");
    try {
      if (reveal) await reveal(artifact.filePath);
      else await copy();
    } catch (error) {
      setActionError(errorText(error));
    }
  };
  const toggleAudio = async () => {
    setActionError("");
    try {
      if (playback.paused) await controls.current?.play();
      else controls.current?.pause();
    } catch (error) {
      setActionError(errorText(error));
    }
  };
  return (
    <figure
      ref={mediaElement}
      tabIndex={0}
      aria-label={title}
      data-media-kind={artifact.type}
      style={
        !visible && mediaSize
          ? { width: mediaSize.width, aspectRatio: `${mediaSize.width} / ${mediaSize.height}` }
          : loading
            ? { minWidth: "min(100%, 16rem)", minHeight: audio ? 56 : 96 }
            : undefined
      }
      className={`app-chat-media relative isolate min-w-0 max-w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring ${audio ? "w-[28rem]" : "w-fit"}`}
    >
      <div className="relative min-w-0 max-w-full overflow-hidden rounded-lg">
        <div
          ref={container}
          aria-label={`${title}预览`}
          aria-hidden={audio || Boolean(previewError)}
          className={audio ? "hidden" : "w-fit max-w-full"}
        />
        {audio && !previewError ? (
          <AudioPlayer
            label={name}
            {...playback}
            disabled={loading}
            onToggle={() => void toggleAudio()}
            onSeek={(seconds) => controls.current?.seek(seconds)}
            onMute={() => controls.current?.setMuted?.(!playback.muted)}
          />
        ) : null}
        {visible && loading && !previewError ? (
          <div role="status" className="flex min-h-14 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            加载预览
          </div>
        ) : null}
        {previewError ? (
          <div className="flex min-h-20 max-w-full flex-col items-start justify-center gap-2 rounded-lg bg-muted/40 p-3 text-xs">
            <p role="alert" className="break-words text-muted-foreground">
              {previewError}
            </p>
            <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
              重试预览
            </Button>
          </div>
        ) : artifact.type === "image" && !loading ? (
          <button
            type="button"
            aria-label={`放大预览${title}`}
            className="absolute inset-0 cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => void open()}
            aria-disabled={opening}
          />
        ) : null}
      </div>
      {!loading && !previewError ? (
        <>
          <figcaption
            className={`app-media-details pointer-events-none absolute max-w-[calc(100%-1rem)] truncate rounded-md bg-black/65 px-2 py-1 text-[11px] leading-5 text-white backdrop-blur-sm ${audio ? "bottom-full left-0 max-w-[calc(100%-11rem)] bg-popover! text-popover-foreground! shadow-sm" : artifact.type === "video" ? "top-2 left-2" : "bottom-2 left-2"}`}
            title={name}
          >
            {name}
            {artifact.size !== undefined ? ` · ${fileSize(artifact.size)}` : ""}
          </figcaption>
          <div
            className={`app-media-details absolute z-10 flex items-center gap-0.5 rounded-lg p-1 text-xs shadow-sm backdrop-blur-md ${audio ? "right-0 bottom-full bg-popover text-popover-foreground" : "top-2 right-2 bg-black/65 text-white"}`}
          >
            <button
              type="button"
              title={reveal ? "在文件管理器中选中此文件" : "复制文件路径"}
              aria-label={reveal ? `打开${title}所在目录` : `复制${title}文件路径`}
              onClick={() => void locate()}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? (
                <CheckIcon aria-hidden="true" className="size-3.5" />
              ) : reveal ? (
                <FolderOpenIcon aria-hidden="true" className="size-3.5" />
              ) : (
                <CopyIcon aria-hidden="true" className="size-3.5" />
              )}
              <span>{copied ? "已复制" : reveal ? "打开所在目录" : "复制路径"}</span>
            </button>
            <button
              type="button"
              aria-label={`预览${title}`}
              title="放大预览"
              onClick={() => void open()}
              aria-disabled={opening}
              className="flex size-7 items-center justify-center rounded-md outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {opening ? (
                <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <ExpandIcon aria-hidden="true" className="size-3.5" />
              )}
            </button>
          </div>
        </>
      ) : null}
      {actionError ? (
        <p role="alert" className="mt-1 max-w-full break-words text-xs text-destructive">
          {actionError}
        </p>
      ) : null}
    </figure>
  );
}

export function MediaResult({ result }: { result: ChatMediaResult }) {
  const video = result.purpose === "video-generation";
  const audio = result.purpose === "speech";
  const type = audio ? "音频" : video ? "视频" : "图片";
  const label =
    result.status === "running"
      ? `正在生成${type}`
      : result.status === "completed"
        ? `${type}已生成`
        : result.status === "stopped"
          ? "已停止等待"
          : result.status === "needs_input"
            ? "需补充生成配置"
            : "生成失败";
  const Icon =
    result.status === "running"
      ? Loader2Icon
      : result.status === "failed"
        ? CircleAlertIcon
        : result.status === "needs_input"
          ? CircleHelpIcon
          : audio
            ? Volume2Icon
            : video
              ? VideoIcon
              : ImageIcon;
  return (
    <section
      aria-label="媒体生成结果"
      className={`${result.outputs.length > 1 && !audio ? "w-[36rem]" : "w-[28rem]"} min-w-0 max-w-full space-y-2 py-1`}
    >
      <div
        className={`${result.status === "completed" && !result.error ? "sr-only" : "flex items-center gap-2 text-xs text-muted-foreground"}`}
        role="status"
      >
        <Icon
          aria-hidden="true"
          className={`size-3.5 shrink-0 ${result.status === "running" ? "animate-spin motion-reduce:animate-none" : ""}`}
        />
        <span className="font-medium text-foreground">{label}</span>
        {result.outputs.length ? <span>· {result.outputs.length} 个文件</span> : null}
      </div>
      {result.status === "running" && result.message ? (
        <p className="text-xs text-muted-foreground">{result.message}</p>
      ) : null}
      {result.error ? (
        <p role={result.status === "failed" ? "alert" : "status"} className="break-words text-xs text-muted-foreground">
          {result.error}
        </p>
      ) : null}
      {result.outputs.length ? (
        <div
          className={`grid w-full min-w-0 max-w-full items-start justify-items-start gap-3 ${result.outputs.length > 1 && !audio ? "grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]" : "grid-cols-1"}`}
        >
          {result.outputs.map((artifact, index) => (
            <MediaArtifact key={artifact.filePath} artifact={artifact} index={index} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
