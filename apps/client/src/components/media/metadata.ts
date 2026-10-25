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
