import { FileIcon, ImageIcon, VideoIcon, Volume2Icon, type LucideIcon } from "lucide-react";
import type { MediaContentProps } from "./types";

type MediaKind = NonNullable<MediaContentProps["type"]>;

/** Type-specific names and icons belong to the media module, never its callers. */
const mediaTypes: Record<MediaKind, { label: string; Icon: LucideIcon }> = {
  image: { label: "图片", Icon: ImageIcon },
  video: { label: "视频", Icon: VideoIcon },
  audio: { label: "音频", Icon: Volume2Icon },
  pdf: { label: "PDF", Icon: FileIcon },
  text: { label: "文本", Icon: FileIcon },
  unsupported: { label: "文件", Icon: FileIcon },
};

export function getMediaType(type: MediaContentProps["type"]) {
  return (type && mediaTypes[type]) || { label: "媒体", Icon: FileIcon };
}

export function getMediaLabels(type: MediaKind, formatLabel?: MediaContentProps["formatLabel"]) {
  const typeLabel = getMediaType(type).label;
  const formatted = (formatLabel ? formatLabel(typeLabel) : typeLabel)?.trim();
  return {
    accessible: formatted || typeLabel,
    visible: formatted || undefined,
  };
}

export function inferType({ type, mimeType, filePath, name, resource }: MediaContentProps): MediaKind {
  if (resource) return resource.kind;
  if (type) return type;
  const mime = mimeType?.split("/")[0];
  if (mime === "image" || mime === "video" || mime === "audio") return mime;
  const extension = (name || filePath || "").split(".").at(-1)?.toLowerCase();
  if (extension && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"].includes(extension))
    return "image";
  if (extension && ["mp4", "webm", "mov", "m4v", "ogv"].includes(extension)) return "video";
  if (extension && ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "aiff"].includes(extension)) return "audio";
  return "unsupported";
}

export const formatFileSize = (bytes?: number) =>
  bytes === undefined
    ? ""
    : bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const formatMediaTime = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** CSS truncates only the prefix; the filename's ending and extension stay visible. */
export function FileName({ name }: { name: string }) {
  const characters = Array.from(name);
  const dot = characters.lastIndexOf(".");
  const stemLength = dot > 0 ? dot : characters.length;
  const suffixLength = Math.min(8, Math.floor(stemLength / 3));
  const split = stemLength - suffixLength;
  return (
    <span data-slot="media-file-name" title={name} className="inline-flex min-w-0 max-w-full align-top" dir="auto">
      <span className="min-w-0 truncate">{characters.slice(0, split).join("")}</span>
      <span className="max-w-[60%] shrink-0 overflow-hidden whitespace-nowrap text-right">
        {characters.slice(split).join("")}
      </span>
    </span>
  );
}
