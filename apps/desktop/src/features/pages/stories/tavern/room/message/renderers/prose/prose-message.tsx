import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/utils/time";
import type { RenderableMessage } from "../../types";
import { MessageControls } from "../shared/message-controls";
import { formatMessageSegmentsForDisplay } from "../shared/message-content";
import { MessageSegmentsContent } from "../shared/message-segments-content";

const roleLabel: Record<RenderableMessage["role"], string> = {
  narrator: "旁白",
  character: "片段",
  user: "用户意图",
};

const proseBlockClassName: Record<RenderableMessage["role"], string> = {
  narrator: "",
  character: "",
  user: "rounded-md bg-current/[0.045] ring-1 ring-current/10",
};

const proseTextClassName: Record<RenderableMessage["role"], string> = {
  narrator: "text-current opacity-90",
  character: "text-current opacity-95",
  user: "text-current opacity-80",
};

export const ProseMessage = ({ message }: { message: RenderableMessage }) => {
  const content = formatMessageSegmentsForDisplay(message.segments, {
    includeThoughts: true,
  }).trim();

  if (!content && message.status !== "streaming") {
    return null;
  }

  return (
    <article className={cn("group/message relative w-full py-2 pl-0 pr-9 sm:pr-12", proseBlockClassName[message.role])}>
      <header className="pointer-events-none absolute left-0 top-0 z-10 flex min-w-0 -translate-y-1/2 items-center gap-2 rounded-sm bg-background/80 px-1 text-[11px] leading-4 text-current opacity-0 shadow-sm backdrop-blur transition-opacity duration-150 group-hover/message:opacity-70 group-focus-within/message:opacity-70">
        <span className="shrink-0 font-medium">
          {message.role === "character" ? message.speakerName : roleLabel[message.role]}
        </span>
        <span className="truncate tabular-nums">{formatTime(message.createdAt)}</span>
        {message.status === "streaming" && <Loader2 className="size-3 animate-spin opacity-70" />}
      </header>

      {message.segments.length > 0 ? (
        <MessageSegmentsContent
          segments={message.segments}
          className={cn("break-words font-serif text-sm leading-7", proseTextClassName[message.role])}
          actionClassName="tavern-immersive-em"
          includeThoughts
        />
      ) : (
        content && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words font-serif text-sm leading-7",
              proseTextClassName[message.role],
            )}
          >
            {content}
          </div>
        )
      )}

      <div className="absolute right-1 top-1">
        <MessageControls content={content} disabled={message.status === "streaming"} />
      </div>
    </article>
  );
};
