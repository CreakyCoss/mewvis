import { useState } from "react";
import {
  CheckCheck,
  Copy,
  FileText,
  Loader2,
  UserRound,
} from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import type { VisualPresetDefinition } from "@/features/visual-presets";
import { SmoothMarkdownContent } from "@/features/workspace-chat/components/chat/smooth-stream-content";
import { cn } from "@/lib/utils";
import { parseTavernReplyText } from "../runtime/reply-cleanup";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../types";

type TavernMessageRowProps = {
  message: TavernMessage;
  room: TavernRoom;
  visualPreset: VisualPresetDefinition;
  character?: TavernCharacter | null;
  characters: TavernCharacter[];
  isSending: boolean;
};

const formatMessageTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export const TavernMessageRow = ({
  message,
  room,
  visualPreset,
  character,
  characters,
  isSending,
}: TavernMessageRowProps) => {
  const isStreaming = message.status === "streaming";

  if (message.role === "narrator") {
    return (
      <div className="group/message mx-auto flex max-w-xl flex-col items-center gap-1">
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-center text-sm leading-6 text-muted-foreground shadow-sm",
            visualPreset.tavern.narratorBubble,
          )}
        >
          {message.content}
        </div>
        <MessageControls content={message.content} disabled={isStreaming} />
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="group/message flex justify-end">
        <div className="flex max-w-[min(80%,680px)] flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 text-xs text-current opacity-75">
            <span>{room.userPersonaName || "我"}</span>
            <UserRound className="size-3.5" />
          </div>
          <div
            className={cn(
              "relative overflow-visible rounded-md border px-3.5 py-2.5 text-sm leading-6 shadow-sm",
              visualPreset.tavern.userBubble,
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute top-4 -right-1 size-2.5 rotate-45 border-t border-r",
                visualPreset.tavern.userBubbleTail,
              )}
              aria-hidden
            />
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
          <span className="text-[11px] text-current opacity-70">
            {formatMessageTime(message.createdAt)}
          </span>
          <MessageControls content={message.content} disabled={isSending || isStreaming} />
        </div>
      </div>
    );
  }

  const avatar = resolveAgentAvatar(character?.avatar);
  const isError = message.status === "error";
  const parsedReply = character
    ? parseTavernReplyText({
        text: message.content,
        activeCharacter: character,
        characters,
        userPersonaName: room.userPersonaName,
      })
    : null;
  const displayContent = parsedReply?.content || message.content;
  const displayThought = message.thought?.trim() || parsedReply?.thought?.trim() || "";
  const copyContent = displayThought
    ? `心想：${displayThought}\n\n${displayContent}`
    : displayContent;
  const immersiveDescriptionEnabled = room.settings.immersiveDescriptionEnabled !== false;
  const immersiveDescriptionClassName = immersiveDescriptionEnabled
    ? "tavern-immersive-em"
    : undefined;

  return (
    <div className="group/message flex justify-start">
      <div className="flex w-full max-w-[min(84%,720px)] gap-3">
        <img
          src={avatar.src}
          alt=""
          className="size-10 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-current">
            <span className="font-medium">{character?.name ?? "角色"}</span>
            <span className="opacity-70">{formatMessageTime(message.createdAt)}</span>
            {isStreaming && <Loader2 className="size-3 animate-spin" />}
          </div>
          <div
            className={cn(
              "relative overflow-visible rounded-md border px-3.5 py-2.5 text-sm leading-6 shadow-sm",
              visualPreset.tavern.characterBubble,
              isError && "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {!isError && (
              <span
                className={cn(
                  "pointer-events-none absolute top-4 -left-1 size-2.5 rotate-45 border-b border-l",
                  visualPreset.tavern.characterBubbleTail,
                )}
                aria-hidden
              />
            )}
            {displayThought && !isError && (
              <div
                className="mb-3 ml-1 w-fit max-w-[94%] rounded-[9px] rounded-tl-[3px] border border-dashed border-current/28 bg-current/[0.085] px-3.5 py-2 text-current shadow-[inset_0_1px_12px_rgba(255,255,255,0.09)] opacity-90"
                aria-label="角色内心想法"
              >
                <p className="whitespace-pre-wrap break-words font-serif text-[12.5px] leading-6 italic opacity-95">
                  （{displayThought}）
                </p>
              </div>
            )}
            <SmoothMarkdownContent
              className={immersiveDescriptionEnabled ? "tavern-immersive-markdown" : undefined}
              content={displayContent}
              emClassName={immersiveDescriptionClassName}
              isStreaming={isStreaming}
              separateEmphasisBlocks={immersiveDescriptionEnabled}
            />
          </div>
          <MessageControls content={copyContent} disabled={isStreaming} />
        </div>
      </div>
    </div>
  );
};

type MessageControlsProps = {
  content: string;
  disabled?: boolean;
};

const MessageControls = ({
  content,
  disabled,
}: MessageControlsProps) => {
  const [didCopy, setDidCopy] = useState(false);
  const canCopy = Boolean(content.trim()) && !disabled;

  if (!content.trim()) {
    return null;
  }

  const copyContent = async () => {
    if (!canCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setDidCopy(true);
      window.setTimeout(() => setDidCopy(false), 1200);
    } catch {
      setDidCopy(false);
    }
  };

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        title={didCopy ? "已复制" : "复制"}
        aria-label={didCopy ? "已复制" : "复制"}
        disabled={!canCopy}
        onClick={() => {
          void copyContent();
        }}
      >
        {didCopy ? (
          <CheckCheck className="size-3.5" />
      ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
};
