import { UserRound } from "lucide-react";
import { cn } from "design-system/lib/utils";
import { formatTime } from "@/utils/time";
import type { MessageVisualStyle } from "../../types";
import { MessageControls } from "../shared/message-controls";

type UserMessageProps = {
  content: string;
  createdAt: number;
  isSending: boolean;
  isStreaming: boolean;
  speakerName: string;
  visualStyle: MessageVisualStyle;
};
export const UserMessage = ({
  content,
  createdAt,
  isSending,
  isStreaming,
  speakerName,
  visualStyle,
}: UserMessageProps) => (
  <div className="group/message flex justify-end">
    <div className="flex max-w-[min(80%,680px)] flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 text-xs text-current opacity-75">
        <span>{speakerName}</span>
        <UserRound className="size-3.5" />
      </div>
      <div className={cn("relative overflow-visible border px-3.5 py-2.5 text-sm leading-6", visualStyle.userBubble)}>
        <span
          className={cn(
            "pointer-events-none absolute top-4 -right-1 size-2.5 rotate-45 border-t border-r",
            visualStyle.userBubbleTail,
          )}
          aria-hidden
        />
        <div className="whitespace-pre-wrap break-words">{content}</div>
      </div>
      <span className="text-xs text-current opacity-70">{formatTime(createdAt)}</span>
      <MessageControls content={content} disabled={isSending || isStreaming} />
    </div>
  </div>
);
