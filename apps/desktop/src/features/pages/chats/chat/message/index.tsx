import { memo, useEffect, useRef } from "react";
import { BotIcon, CircleAlertIcon } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { Spinner } from "@/components/ui/spinner";
import type { ChatDisplayOptions } from "../../components/chat-input/type";
import type { ChatMessage } from "../type";
import { MessageBlocks } from "./block";

type ChatMessagesProps = {
  messages: ChatMessage[];
  isInitializing: boolean;
  pendingQuestionId?: string;
  displayOptions: ChatDisplayOptions;
};

const formatMessageTime = (createdAt: number) =>
  new Date(createdAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

const MessageItemComponent = ({
  message,
  displayOptions,
}: {
  message: ChatMessage;
  displayOptions: ChatDisplayOptions;
}) => {
  const isAssistant = message.role === "assistant";
  const agentAvatar = isAssistant && message.agentAvatar ? resolveAvatar(message.agentAvatar) : undefined;

  return (
    <div
      className="flex min-w-0 max-w-full gap-3 data-[role=user]:justify-end data-[role=user]:pr-2 xl:data-[role=user]:pr-6"
      data-role={message.role}
    >
      {isAssistant ? (
        <div
          className="mt-1 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/15 bg-accent text-primary shadow-xs"
          title={message.agentName ?? "助手"}
        >
          {agentAvatar ? (
            <img src={agentAvatar.src} alt="" className="size-full object-cover" />
          ) : (
            <BotIcon aria-hidden="true" className="size-4" />
          )}
        </div>
      ) : null}

      <div
        className="flex min-w-0 max-w-[88%] flex-col gap-1 lg:max-w-[82%] xl:max-w-[78%] data-[role=assistant]:items-start data-[role=user]:items-end"
        data-role={message.role}
      >
        {isAssistant ? (
          <div className="flex h-6 w-fit min-w-0 items-center gap-1.5 px-1 text-[11px] leading-none text-muted-foreground">
            <span className="truncate font-medium">{message.agentName ?? "助手"}</span>
            <span aria-hidden="true">·</span>
            <time className="shrink-0 tabular-nums" dateTime={new Date(message.createdAt).toISOString()}>
              {formatMessageTime(message.createdAt)}
            </time>
          </div>
        ) : null}

        <article
          aria-label={isAssistant ? `${message.agentName ?? "助手"}的消息` : "你的消息"}
          className="relative min-w-0 max-w-full overflow-hidden rounded-md px-3.5 py-2.5 text-sm leading-6 shadow-xs data-[role=assistant]:w-full data-[role=assistant]:bg-card data-[role=user]:bg-primary data-[role=user]:text-primary-foreground"
          data-role={message.role}
        >
          <MessageBlocks message={message} displayOptions={displayOptions} />

          {message.status === "error" ? (
            <div role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <CircleAlertIcon aria-hidden="true" className="size-3.5" />
              本次生成未正常完成
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
};

const MessageItem = memo(MessageItemComponent);

export const ChatMessages = ({ messages, isInitializing, pendingQuestionId, displayOptions }: ChatMessagesProps) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingQuestionId]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-[69rem] flex-col gap-6" aria-live="polite" aria-busy={isInitializing}>
        {isInitializing ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            正在加载对话
          </div>
        ) : null}

        {!isInitializing && messages.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            输入消息开始对话
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageItem key={message.id} message={message} displayOptions={displayOptions} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
