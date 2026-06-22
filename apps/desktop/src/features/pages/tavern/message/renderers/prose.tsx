import { Loader2 } from "lucide-react";
import { SmoothMarkdownContent } from "@/features/ai/components/markdown";
import { cn } from "@/lib/utils";
import {
  formatTavernMessageSegmentsForDisplay,
} from "../domain/segments";
import type { TavernRenderableMessage } from "../domain/render-model";
import { MessageControls } from "../components/message-controls";
import { MessagePrivateIntel } from "../components/message-private-intel";
import { formatTavernMessageTime } from "../components/message-time";
import type { TavernConversationRenderer } from "./types";

const roleLabel: Record<TavernRenderableMessage["role"], string> = {
  narrator: "旁白",
  character: "片段",
  user: "用户意图",
};

const proseBlockClassName: Record<TavernRenderableMessage["role"], string> = {
  narrator: "border-l-2 border-current/35",
  character: "border-l-2 border-current/50",
  user: "rounded-md bg-current/[0.045] ring-1 ring-current/10",
};

const proseTextClassName: Record<TavernRenderableMessage["role"], string> = {
  narrator: "text-current opacity-90",
  character: "text-current opacity-95",
  user: "text-current opacity-80",
};

const ProseMessage = ({
  message,
}: {
  message: TavernRenderableMessage;
}) => {
  const content = formatTavernMessageSegmentsForDisplay(message.segments, {
    includeThoughts: false,
  }).trim() || message.content.trim();
  const thought = message.segments
    .filter((segment) => segment.type === "thought")
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n") || message.thought?.trim() || "";
  const copyContent = thought ? `${content}\n\n（${thought}）` : content;

  if (!content && !thought && message.status !== "streaming") {
    return null;
  }

  return (
    <article
      className={cn(
        "group/message relative w-full py-2 pl-4 pr-9 sm:pl-5 sm:pr-12",
        proseBlockClassName[message.role],
      )}
    >
      <header
        className="mb-1 flex min-w-0 items-center gap-2 text-[11px] leading-4 text-current opacity-70"
      >
        <span className="shrink-0 font-medium">
          {message.role === "character" ? message.speakerName : roleLabel[message.role]}
        </span>
        <span className="truncate tabular-nums">{formatTavernMessageTime(message.createdAt)}</span>
        {message.status === "streaming" && <Loader2 className="size-3 animate-spin opacity-70" />}
      </header>

      {content && (
        <SmoothMarkdownContent
          className={cn(
            "tavern-immersive-markdown break-words font-serif text-sm leading-7",
            proseTextClassName[message.role],
          )}
          content={content}
          emClassName="tavern-immersive-em"
          isStreaming={message.status === "streaming"}
          separateEmphasisBlocks
          variant="tavern"
        />
      )}

      {thought && (
        <div className="mt-2 border-l border-dashed border-current/25 pl-3">
          <p
            className="whitespace-pre-wrap break-words font-serif text-xs leading-6 text-current opacity-70 italic"
          >
            {thought}
          </p>
        </div>
      )}

      <MessagePrivateIntel align="center" factEvents={message.userVisibleFactEvents} />
      <div className="absolute right-1 top-1">
        <MessageControls content={copyContent} disabled={message.status === "streaming"} />
      </div>
    </article>
  );
};

export const proseConversationRenderer: TavernConversationRenderer = {
  id: "prose",
  Conversation: ({
    messages,
    shouldShowExecutionTrace,
    executionTraceAnchorMessageId,
    hasExecutionTraceAnchor,
    renderExecutionTrace,
    messageEndRef,
  }) => (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-2 py-1">
      {messages.map((message) => (
        <div key={message.id} className="contents">
          <ProseMessage message={message} />
          {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && (
            renderExecutionTrace()
          )}
        </div>
      ))}
      {shouldShowExecutionTrace && !hasExecutionTraceAnchor && renderExecutionTrace()}
      <div ref={messageEndRef} />
    </div>
  ),
};
