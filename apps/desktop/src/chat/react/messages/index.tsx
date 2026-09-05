import { Fragment, memo, type ReactNode } from "react";
import { BotIcon, CircleAlertIcon } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { Spinner } from "@/components/ui/spinner";
import type { ChatDisplayOptions } from "@/chat/react/types";
import type { ChatMessage } from "@/chat/core";
import { MessageActions } from "./actions";
import { MessageBlocks } from "./block";
import { useFollowBottom } from "./follow-bottom";

export type ChatMessagesProps = {
  className?: string;
  renderMessage?: (message: ChatMessage, defaultMessage: ReactNode) => ReactNode;
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

export const MessageView = ({
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
          className="mt-1 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/15 bg-accent text-primary shadow-[var(--shadow-card)]"
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
        className="group/message flex min-w-0 max-w-[88%] flex-col gap-1 lg:max-w-[82%] xl:max-w-[78%] data-[role=assistant]:items-start data-[role=user]:items-end"
        data-role={message.role}
      >
        {isAssistant ? (
          <div className="flex min-h-6 w-fit min-w-0 items-center gap-1.5 px-1 text-xs leading-none text-muted-foreground">
            <span className="truncate font-medium">{message.agentName ?? "助手"}</span>
            <span aria-hidden="true">·</span>
            <time className="shrink-0 tabular-nums" dateTime={new Date(message.createdAt).toISOString()}>
              {formatMessageTime(message.createdAt)}
            </time>
          </div>
        ) : null}

        <article
          aria-label={isAssistant ? `${message.agentName ?? "助手"}的消息` : "你的消息"}
          className={[
            "relative min-w-0 max-w-full overflow-hidden rounded-xl px-4 py-3 text-sm leading-6",
            isAssistant
              ? "app-message-surface w-full"
              : "bg-primary text-primary-foreground shadow-[var(--shadow-card)]",
          ].join(" ")}
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
        <MessageActions message={message} />
      </div>
    </div>
  );
};

const MessageItem = memo(MessageView);

export const MessagesView = ({
  messages,
  isInitializing,
  pendingQuestionId,
  displayOptions,
  className = "",
  renderMessage,
}: ChatMessagesProps) => {
  const { scrollRef, handleScroll } = useFollowBottom(messages, true, pendingQuestionId);

  return (
    <div
      ref={scrollRef}
      className={`min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 ${className}`}
      onScroll={handleScroll}
    >
      <div className="mx-auto flex w-full max-w-[69rem] flex-col gap-6" aria-live="polite" aria-busy={isInitializing}>
        {isInitializing ? (
          <div className="app-empty-state flex min-h-44 flex-col items-center justify-center rounded-2xl px-6 text-center">
            <Spinner className="motion-reduce:animate-none" />
            <div className="mt-3 text-sm font-semibold text-foreground">正在加载对话</div>
          </div>
        ) : null}

        {!isInitializing && messages.length === 0 ? (
          <div className="app-empty-state flex min-h-44 flex-col items-center justify-center rounded-2xl px-6 text-center">
            <div className="text-sm font-semibold text-foreground">输入消息开始对话</div>
          </div>
        ) : null}

        {messages.map((message) => (
          <Fragment key={message.id}>
            {renderMessage ? (
              renderMessage(message, <MessageItem message={message} displayOptions={displayOptions} />)
            ) : (
              <MessageItem message={message} displayOptions={displayOptions} />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
};
