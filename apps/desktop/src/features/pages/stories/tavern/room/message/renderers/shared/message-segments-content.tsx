import { cn } from "@/lib/utils";
import type { MessageSegment } from "../../types";

type MessageSegmentsContentProps = {
  segments: MessageSegment[];
  className?: string;
  dialogueClassName?: string;
  actionClassName?: string;
  narrationClassName?: string;
  textClassName?: string;
  includeThoughts?: boolean;
};

const segmentTextClassName = "whitespace-pre-wrap break-words";

export const MessageSegmentsContent = ({
  segments,
  className,
  dialogueClassName,
  actionClassName,
  narrationClassName,
  textClassName,
  includeThoughts = false,
}: MessageSegmentsContentProps) => {
  const visibleSegments = segments.filter((segment) => includeThoughts || segment.type !== "thought");

  if (visibleSegments.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {visibleSegments.map((segment, index) => {
        if (segment.type === "action") {
          return (
            <p key={index} className={cn(segmentTextClassName, "font-serif italic opacity-75", actionClassName)}>
              {segment.text}
            </p>
          );
        }

        if (segment.type === "narration") {
          return (
            <p key={index} className={cn(segmentTextClassName, narrationClassName)}>
              {segment.text}
            </p>
          );
        }

        if (segment.type === "dialogue") {
          return (
            <p key={index} className={cn(segmentTextClassName, dialogueClassName)}>
              {segment.text}
            </p>
          );
        }

        if (segment.type === "thought") {
          return (
            <p key={index} className={cn(segmentTextClassName, "font-serif italic opacity-70", textClassName)}>
              {segment.text}
            </p>
          );
        }

        return (
          <p key={index} className={cn(segmentTextClassName, textClassName)}>
            {segment.text}
          </p>
        );
      })}
    </div>
  );
};
