import { memo, useRef, useState, useEffect } from "react";
import { BotIcon, BrainIcon, CheckIcon, ChevronDownIcon, CircleAlertIcon, Loader2Icon, WrenchIcon } from "lucide-react";
import { resolveAvatar } from "@/assets/avatars";
import { Spinner } from "@/components/ui/spinner";
import type { ChatMessage, ChatToolCall } from "../type";
import { MessageMarkdown } from "./markdown";

type ChatMessagesProps = {
  messages: ChatMessage[];
  isInitializing: boolean;
  pendingQuestionId?: string;
};

type ThinkingProcessProps = {
  content: string;
  isRunning: boolean;
};

const ThinkingProcess = ({ content, isRunning }: ThinkingProcessProps) => {
  const [manualExpanded, setManualExpanded] = useState<boolean>();
  const isExpanded = manualExpanded ?? isRunning;

  return (
    <div className="mb-2 overflow-hidden rounded-md bg-muted/35 shadow-xs">
      <button
        type="button"
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => setManualExpanded(!isExpanded)}
      >
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
        />
        <BrainIcon aria-hidden="true" className="size-3.5" />
        <span>思考过程</span>
        {isRunning ? <Loader2Icon aria-hidden="true" className="ml-auto size-3 animate-spin" /> : null}
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-48 overflow-auto bg-background/45 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolCallStatus = ({ tool }: { tool: ChatToolCall }) => {
  const statusLabel = tool.status === "running" ? "执行中" : tool.status === "done" ? "已完成" : "执行异常";

  return (
    <div className="flex min-h-8 items-center gap-2 rounded-md bg-muted/35 px-2.5 text-xs text-muted-foreground shadow-xs">
      <WrenchIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{tool.name}</span>
      <span
        className={`flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] ${
          tool.status === "error"
            ? "bg-destructive/10 text-destructive"
            : tool.status === "running"
              ? "bg-primary/10 text-primary"
              : "bg-background text-muted-foreground"
        }`}
      >
        {tool.status === "running" ? (
          <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
        ) : tool.status === "done" ? (
          <CheckIcon aria-hidden="true" className="size-3" />
        ) : (
          <CircleAlertIcon aria-hidden="true" className="size-3" />
        )}
        {statusLabel}
      </span>
    </div>
  );
};

const formatMessageTime = (createdAt: number) =>
  new Date(createdAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

const MessageItemComponent = ({ message }: { message: ChatMessage }) => {
  const isAssistant = message.role === "assistant";
  const isRunning = message.status === "loading" || message.status === "streaming";
  const thinking = message.showThinkingProcess ? message.thinking?.trim() : undefined;
  const toolCalls = message.showToolCallProcess ? (message.toolCalls ?? []) : [];
  const hasVisibleProcess = Boolean(thinking) || toolCalls.length > 0;
  const agentAvatar = message.agentAvatar ? resolveAvatar(message.agentAvatar) : undefined;

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
          {isAssistant && thinking ? <ThinkingProcess content={thinking} isRunning={isRunning} /> : null}

          {isAssistant && toolCalls.length > 0 ? (
            <div className="mb-2 space-y-1.5">
              {toolCalls.map((tool) => (
                <ToolCallStatus key={tool.id} tool={tool} />
              ))}
            </div>
          ) : null}

          {isAssistant ? (
            message.text ? (
              <MessageMarkdown content={message.text} />
            ) : isRunning && !hasVisibleProcess ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner />
                <span>{message.agentName ? "Agent 正在处理" : "AI 正在思考"}</span>
              </div>
            ) : null
          ) : (
            <div className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</div>
          )}

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

export const ChatMessages = ({ messages, isInitializing, pendingQuestionId }: ChatMessagesProps) => {
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
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
