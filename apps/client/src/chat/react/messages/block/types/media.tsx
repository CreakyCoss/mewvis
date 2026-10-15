import { useEffect, useRef, useState } from "react";
import { CheckIcon, CircleAlertIcon, CopyIcon, ExpandIcon, ImageIcon, Loader2Icon, VideoIcon } from "lucide-react";
import { writeClipboardText } from "@mewvis/app-sdk/browser";
import { getApplicationFileClient, type FilePreviewView } from "@mewvis/app-sdk/files";
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
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [actionError, setActionError] = useState("");
  const [revision, setRevision] = useState(0);
  const [opening, setOpening] = useState(false);
  const [copied, setCopied] = useState(false);
  const title = `${artifact.type === "video" ? "视频" : "图片"} ${index + 1}`;
  const name = artifact.filePath.split(/[\\/]/).at(-1) || title;

  useEffect(() => {
    if (!container.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !container.current) return;
    const target = container.current;
    let disposed = false;
    let view: FilePreviewView | undefined;
    setLoading(true);
    setPreviewError("");
    void (async () => {
      view = await (preview ?? getApplicationFileClient().preview).open(target, { filePath: artifact.filePath });
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
  }, [artifact.filePath, preview, visible, revision]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const open = async () => {
    setOpening(true);
    setActionError("");
    try {
      await (preview ?? getApplicationFileClient().preview).openDialog({ filePath: artifact.filePath });
    } catch (error) {
      setActionError(errorText(error));
    } finally {
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
  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/60">
      <div className="relative h-64 bg-muted/25 sm:h-72">
        <div
          ref={container}
          aria-label={`${title}预览`}
          aria-hidden={Boolean(previewError)}
          className="h-full w-full p-2"
        />
        {visible && loading && !previewError ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-background/80 text-xs text-muted-foreground"
          >
            <Loader2Icon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            加载预览
          </div>
        ) : null}
        {previewError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background p-4 text-center text-xs">
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
            className="absolute inset-0 cursor-zoom-in rounded-t-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => void open()}
            disabled={opening}
          />
        ) : null}
      </div>
      <figcaption className="flex min-w-0 items-center gap-2 border-t border-border/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span>{title}</span>
            <span className="font-normal text-muted-foreground">{fileSize(artifact.size)}</span>
          </div>
          <div className="truncate text-[11px] leading-5 text-muted-foreground" title={artifact.filePath}>
            {name}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`预览${title}`}
          title="预览与打开原文件"
          onClick={() => void open()}
          disabled={opening}
        >
          {opening ? <Loader2Icon className="size-3.5 animate-spin" /> : <ExpandIcon className="size-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={`复制${title}文件路径`}
          title={copied ? "已复制" : "复制文件路径"}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </Button>
      </figcaption>
      {actionError ? (
        <p role="alert" className="px-3 pb-2 text-xs text-destructive">
          {actionError}
        </p>
      ) : null}
    </figure>
  );
}

export function MediaResult({ result }: { result: ChatMediaResult }) {
  const video = result.purpose === "video-generation";
  const type = video ? "视频" : "图片";
  const label =
    result.status === "running"
      ? `正在生成${type}`
      : result.status === "completed"
        ? `${type}已生成`
        : result.status === "stopped"
          ? "已停止等待"
          : "生成失败";
  const Icon =
    result.status === "running"
      ? Loader2Icon
      : result.status === "failed"
        ? CircleAlertIcon
        : video
          ? VideoIcon
          : ImageIcon;
  return (
    <section aria-label="媒体生成结果" className="w-[36rem] min-w-0 max-w-full space-y-3 py-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
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
          className={`grid min-w-0 gap-3 ${result.outputs.length > 1 ? "grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]" : "max-w-md grid-cols-1"}`}
        >
          {result.outputs.map((artifact, index) => (
            <MediaArtifact key={artifact.filePath} artifact={artifact} index={index} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
