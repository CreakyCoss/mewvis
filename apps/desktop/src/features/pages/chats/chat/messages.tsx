import { useEffect, useRef } from "react";
import { CheckIcon, CircleAlertIcon, Loader2Icon, WrenchIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Spinner } from "@/components/ui/spinner";
import type { ChatMessage } from "./type";

type ChatMessagesProps = {
  messages: ChatMessage[];
  isInitializing: boolean;
  pendingQuestionId?: string;
};

export const ChatMessages = ({ messages, isInitializing, pendingQuestionId }: ChatMessagesProps) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingQuestionId]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-[69rem] flex-col gap-6" aria-live="polite">
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

        {messages.map((message) =>
          message.role === "user" ? (
            <article
              key={message.id}
              className="ml-auto max-w-[min(42rem,85%)] rounded-2xl bg-muted px-4 py-3 text-sm leading-6 whitespace-pre-wrap"
            >
              {message.text}
            </article>
          ) : (
            <article key={message.id} className="max-w-[min(52rem,92%)] text-sm leading-7">
              {message.agentName ? (
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {message.agentAvatar ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-muted text-sm">
                      {message.agentAvatar}
                    </span>
                  ) : null}
                  {message.agentName}
                </div>
              ) : null}

              {message.showThinkingProcess && message.thinking ? (
                <details className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium">思考过程</summary>
                  <div className="mt-2 whitespace-pre-wrap leading-5">{message.thinking}</div>
                </details>
              ) : null}

              {message.showToolCallProcess && message.toolCalls?.length ? (
                <div className="mb-3 space-y-1.5">
                  {message.toolCalls.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex min-h-8 items-center gap-2 rounded-md bg-muted/50 px-2.5 text-xs text-muted-foreground"
                    >
                      {tool.status === "running" ? (
                        <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
                      ) : tool.status === "done" ? (
                        <CheckIcon aria-hidden="true" className="size-3.5" />
                      ) : (
                        <CircleAlertIcon aria-hidden="true" className="size-3.5 text-destructive" />
                      )}
                      <WrenchIcon aria-hidden="true" className="size-3.5" />
                      <span>{tool.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {message.text ? (
                <div className="space-y-3 break-words [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                </div>
              ) : message.status === "loading" || message.status === "streaming" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Spinner />
                  正在生成
                </div>
              ) : null}

              {message.status === "error" ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                  <CircleAlertIcon aria-hidden="true" className="size-3.5" />
                  本次生成未正常完成
                </div>
              ) : null}
            </article>
          ),
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};
