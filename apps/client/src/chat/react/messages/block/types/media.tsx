import { CircleAlertIcon, CircleHelpIcon, ImageIcon, Loader2Icon, VideoIcon, Volume2Icon } from "lucide-react";
import type { ChatMediaResult } from "@/chat/core";
import { Media } from "@/components/media";

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
            <Media
              key={artifact.filePath}
              filePath={artifact.filePath}
              type={artifact.type}
              mimeType={artifact.mimeType}
              size={artifact.size}
              formatLabel={(label) => `${label} ${index + 1}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
