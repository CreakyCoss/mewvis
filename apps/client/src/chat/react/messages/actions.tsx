import { writeClipboardText } from "@isle/app-sdk/browser";
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import type { ChatMessage } from "@/chat/core";

const getMessageText = (message: ChatMessage) => {
  if (message.role === "assistant") {
    return message.blocks
      .filter((block) => block.type === "text")
      .map((block) => block.content)
      .join("\n\n")
      .trim();
  }

  return message.blocks
    .map((block) => {
      if (block.type === "skill-reference" || block.type === "command-reference") {
        return `/${block.name}`;
      }
      if (block.type === "file-reference") {
        return /[\s，。；,;]/.test(block.path) ? `@"${block.path}"` : `@${block.path}`;
      }
      return block.content;
    })
    .join("")
    .trim();
};

const formatMessageTime = (createdAt: number) =>
  new Date(createdAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

type MessageActionsProps = {
  message: ChatMessage;
};

export const MessageActions = ({ message }: MessageActionsProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const text = getMessageText(message);
  const isStreaming = message.status === "loading" || message.status === "streaming";

  useEffect(() => {
    if (!isCopied) {
      return undefined;
    }

    const timer = window.setTimeout(() => setIsCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  if (isStreaming) {
    return null;
  }

  const copyMessage = async () => {
    if (!text) {
      return;
    }

    try {
      await writeClipboardText(text);
      setIsCopied(true);
    } catch {
      return;
    }
  };

  return (
    <div
      className={[
        "pointer-events-none flex h-7 items-center gap-0.5 rounded-md bg-transparent px-0.5 text-xs text-muted-foreground opacity-0 transition-opacity duration-150 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100 group-hover/message:pointer-events-auto group-hover/message:opacity-100",
        message.role === "user" ? "self-end" : "self-start",
      ].join(" ")}
    >
      {message.role === "user" ? (
        <time
          className="px-1.5 tabular-nums text-muted-foreground/85"
          dateTime={new Date(message.createdAt).toISOString()}
        >
          {formatMessageTime(message.createdAt)}
        </time>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-lg bg-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground"
        title="复制"
        aria-label="复制消息"
        disabled={!text}
        onClick={() => void copyMessage()}
      >
        {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        <span className="sr-only">复制</span>
      </Button>
    </div>
  );
};
