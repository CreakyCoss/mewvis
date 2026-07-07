import { Loader2 } from "lucide-react";
import { SmoothMarkdownContent } from "@/features/ai/components/markdown";
import { cn } from "@/lib/utils";
import { formatTavernMessageSegmentsForDisplay } from "../domain/segments";
import type { TavernRenderableMessage } from "../domain/render-model";
import { MessageControls } from "../components/message-controls";
import { formatTavernMessageTime } from "../components/message-time";
import type { TavernConversationRenderer } from "./types";

const roleLabel: Record<TavernRenderableMessage["role"], string> = {
  narrator: "旁白",
  character: "片段",
  user: "用户意图",
};

const proseBlockClassName: Record<TavernRenderableMessage["role"], string> = {
  narrator: "",
  character: "",
  user: "rounded-md bg-current/[0.045] ring-1 ring-current/10",
};

const proseTextClassName: Record<TavernRenderableMessage["role"], string> = {
  narrator: "text-current opacity-90",
  character: "text-current opacity-95",
  user: "text-current opacity-80",
};

const ProseMessage = ({ message }: { message: TavernRenderableMessage }) => {
  const content =
    formatTavernMessageSegmentsForDisplay(message.segments, {
      includeThoughts: false,
    }).trim() || message.content.trim();
  const thought =
    message.segments
      .filter((segment) => segment.type === "thought")
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n\n") ||
    message.thought?.trim() ||
    "";
  const copyContent = thought ? `${content}\n\n（${thought}）` : content;

  if (!content && !thought && message.status !== "streaming") {
    return null;
  }

  return (
    <article className={cn("group/message relative w-full py-2 pl-0 pr-9 sm:pr-12", proseBlockClassName[message.role])}>
      <header className="pointer-events-none absolute left-0 top-0 z-10 flex min-w-0 -translate-y-1/2 items-center gap-2 rounded-sm bg-background/80 px-1 text-[11px] leading-4 text-current opacity-0 shadow-sm backdrop-blur transition-opacity duration-150 group-hover/message:opacity-70 group-focus-within/message:opacity-70">
        <span className="shrink-0 font-medium">
          {message.role === "character" ? message.speakerName : roleLabel[message.role]}
        </span>
        <span className="truncate tabular-nums">{formatTavernMessageTime(message.createdAt)}</span>
        {message.status === "streaming" && <Loader2 className="size-3 animate-spin opacity-70" />}
      </header>

      {content && (
        <SmoothMarkdownContent
          className={cn(
            "tavern-immersive-markdown break-words font-serif text-sm leading-7 [&_p]:mb-1.5",
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
          <p className="whitespace-pre-wrap break-words font-serif text-xs leading-6 text-current opacity-70 italic">
            {thought}
          </p>
        </div>
      )}

      <div className="absolute right-1 top-1">
        <MessageControls content={copyContent} disabled={message.status === "streaming"} />
      </div>
    </article>
  );
};

export const proseConversationRenderer: TavernConversationRenderer = {
  id: "prose",
  Conversation: ({ messages, isSidePanelOpen, messageEndRef }) => (
    <div className={cn("mx-auto flex w-full flex-col gap-1 py-1", isSidePanelOpen ? "max-w-[44rem]" : "max-w-[46rem]")}>
      {messages.map((message) => (
        <div key={message.id} className="contents">
          <ProseMessage message={message} />
        </div>
      ))}
      <div ref={messageEndRef} />
    </div>
  ),
};
