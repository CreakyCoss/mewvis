import { cn } from "design-system/lib/utils";
import type { MessageSegment, MessageVisualStyle } from "../../types";
import { MessageControls } from "../shared/message-controls";
import { MessageSegmentsContent } from "../shared/message-segments-content";

type NarratorMessageProps = {
  content: string;
  isStreaming: boolean;
  segments: MessageSegment[];
  visualStyle: MessageVisualStyle;
};
export const NarratorMessage = ({ content, isStreaming, segments, visualStyle }: NarratorMessageProps) => (
  <div className="group/message mx-auto flex max-w-xl flex-col items-center gap-1">
    <div
      className={cn("border px-3 py-2 text-center text-sm leading-6 text-muted-foreground", visualStyle.narratorBubble)}
    >
      {segments.length > 0 ? <MessageSegmentsContent segments={segments} /> : content}
    </div>
    <MessageControls content={content} disabled={isStreaming} />
  </div>
);
