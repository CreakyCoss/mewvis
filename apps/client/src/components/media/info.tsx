import { CheckIcon, CopyIcon, ExpandIcon, FolderOpenIcon, Loader2Icon } from "lucide-react";
import { FileName, formatFileSize, getMediaType } from "./util";
import type { MediaContentProps } from "./types";

/** The same information/action hierarchy is used on audio, canvases and small-media popovers. */
export function MediaInfo({
  name,
  type,
  size,
  label,
  stacked = false,
  canReveal,
  copied,
  opening,
  onLocate,
  onOpen,
}: {
  name: string;
  type: MediaContentProps["type"];
  size?: number;
  label: string;
  stacked?: boolean;
  canReveal: boolean;
  copied: boolean;
  opening: boolean;
  onLocate(): void;
  onOpen(): void;
}) {
  const { Icon } = getMediaType(type);
  const extension = name.includes(".") ? name.split(".").at(-1)?.toUpperCase() : "";
  const metadata = [extension, formatFileSize(size)].filter(Boolean).join(" · ");
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${stacked ? "h-12 px-3.5" : "min-h-10 px-2.5 py-1"}`}>
      <Icon aria-hidden="true" className={`size-4 shrink-0 ${type === "audio" ? "text-primary" : "opacity-80"}`} />
      <div className="min-w-0 flex-1">
        <div className={`font-medium leading-5 ${stacked ? "text-sm" : "text-xs"}`}>
          <FileName name={name} />
        </div>
        {stacked && <div className="h-4 truncate text-xs leading-4 text-muted-foreground">{metadata}</div>}
      </div>
      {!stacked && <span className="shrink-0 text-[11px] tabular-nums opacity-80">{formatFileSize(size)}</span>}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          title={copied ? "已复制路径" : canReveal ? "打开所在目录" : "复制文件路径"}
          aria-label={canReveal ? `打开${label}所在目录` : `复制${label}文件路径`}
          onClick={onLocate}
          className="media-action flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : canReveal ? (
            <FolderOpenIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </button>
        <button
          type="button"
          title="放大预览"
          aria-label={`预览${label}`}
          aria-disabled={opening}
          onClick={onOpen}
          className="media-action flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {opening ? <Loader2Icon className="size-4 animate-spin" /> : <ExpandIcon className="size-4" />}
        </button>
      </div>
    </div>
  );
}
