import { cn } from "@/lib/utils";
import type { MessageVisualStyle } from "../../types";
import { MessageControls } from "../shared/message-controls";

type NarratorMessageProps = {
  content: string;
  isStreaming: boolean;
  visualStyle: MessageVisualStyle;
};
export const NarratorMessage = ({ content, isStreaming, visualStyle }: NarratorMessageProps) => (
  <div className="group/message mx-auto flex max-w-xl flex-col items-center gap-1">
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-center text-sm leading-6 text-muted-foreground shadow-sm",
        visualStyle.narratorBubble,
      )}
    >
      {content}
    </div>
    <MessageControls content={content} disabled={isStreaming} />
  </div>
);
