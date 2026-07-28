import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "../type";

const getMessageText = (message: ChatMessage) =>
  message.blocks
    .filter((block) => block.type === "text")
    .map((block) => block.content)
    .join("\n\n")
    .trim();

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
    if (!text || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
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
