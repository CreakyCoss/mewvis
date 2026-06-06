import { FileText, Loader2, UserRound } from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { SmoothMarkdownContent } from "@/features/workspace-chat/components/chat/smooth-stream-content";
import { cn } from "@/lib/utils";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../types";

type TavernMessageRowProps = {
  message: TavernMessage;
  room: TavernRoom;
  character?: TavernCharacter | null;
};

const formatMessageTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export const TavernMessageRow = ({
  message,
  room,
  character,
}: TavernMessageRowProps) => {
  if (message.role === "narrator") {
    return (
      <div className="mx-auto max-w-xl rounded-md border bg-background/70 px-3 py-2 text-center text-sm leading-6 text-muted-foreground shadow-sm">
        {message.content}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[min(80%,680px)] flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{room.userPersonaName || "我"}</span>
            <UserRound className="size-3.5" />
          </div>
          <div className="rounded-md bg-primary px-3.5 py-2.5 text-sm leading-6 text-primary-foreground shadow-sm">
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
            {message.referencedFiles && message.referencedFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-end gap-1">
                {message.referencedFiles.map((file) => (
                  <span
                    key={file.path}
                    className="inline-flex max-w-full items-center gap-1 rounded-[5px] bg-primary-foreground/15 px-1.5 py-0.5 text-[11px] text-primary-foreground/85"
                    title={file.path}
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="truncate">{file.path}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground/70">
            {formatMessageTime(message.createdAt)}
          </span>
        </div>
      </div>
    );
  }

  const avatar = resolveAgentAvatar(character?.avatar);
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[min(84%,720px)] gap-3">
        <img
          src={avatar.src}
          alt=""
          className="mt-6 size-10 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{character?.name ?? "角色"}</span>
            <span>{formatMessageTime(message.createdAt)}</span>
            {isStreaming && <Loader2 className="size-3 animate-spin" />}
          </div>
          <div
            className={cn(
              "rounded-md border bg-background/85 px-3.5 py-2.5 text-sm leading-6 shadow-sm",
              isError && "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            <SmoothMarkdownContent
              content={message.content}
              isStreaming={isStreaming}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
