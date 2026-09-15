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
  user: "rounded-xl bg-current/[0.045] ring-1 ring-current/10",
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
    <article
      className={cn("group/message relative w-full py-3 pl-0 pr-10 sm:pr-12", proseBlockClassName[message.role])}
    >
      <header className="pointer-events-none absolute top-0 left-0 z-10 flex min-w-0 -translate-y-1/2 items-center gap-2 rounded-md bg-current/[0.06] px-1.5 py-0.5 text-xs leading-4 text-current opacity-[0.58] backdrop-blur transition-opacity duration-150 motion-reduce:transition-none group-hover/message:opacity-80 group-focus-within/message:opacity-80">
        <span className="shrink-0 font-medium">
          {message.role === "character" ? message.speakerName : roleLabel[message.role]}
        </span>
        <span className="truncate tabular-nums">{formatTime(message.createdAt)}</span>
        {message.status === "streaming" && (
          <Loader2 className="size-3 animate-spin opacity-70 motion-reduce:animate-none" />
        )}
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
