import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { ChatInput } from "../components/chat-input";
import type { ChatInputOptions } from "../components/chat-input/type";
import { ChatMessages } from "./message";
import { ChatQuestion } from "./question";
import type { ChatProps } from "./type";
import { useChat } from "./use-chat";

export const Chat = ({
  chatId,
  workspacePath,
  files = [],
  initialData,
  saveChat,
  onStatusChange,
  onOptionsChange,
}: ChatProps) => {
  const [options, setOptions] = useState<ChatInputOptions | null>(null);
  const chat = useChat({
    chatId,
    workspacePath,
    initialRequest: initialData.initialRequest,
    saveChat,
    onStatusChange,
  });
  const displayOptions = useMemo(
    () => ({
      showThinkingProcess: options?.showThinkingProcess ?? initialData.options.showThinkingProcess ?? true,
      showToolCallProcess: options?.showToolCallProcess ?? initialData.options.showToolCallProcess ?? true,
    }),
    [initialData.options.showThinkingProcess, initialData.options.showToolCallProcess, options],
  );
  const handleOptionsChange = useCallback(
    (nextOptions: ChatInputOptions) => {
      setOptions(nextOptions);
      onOptionsChange?.(nextOptions);
    },
    [onOptionsChange],
  );

  useEffect(() => {
    setOptions(null);
  }, [chatId]);

  return (
    <main className="flex h-full min-h-0 bg-background text-foreground">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatMessages
          messages={chat.messages}
          isInitializing={chat.isInitializing}
          pendingQuestionId={chat.pendingQuestion?.questionId}
          displayOptions={displayOptions}
        />

        <div className="shrink-0 space-y-3 bg-background/95 px-4 py-4 backdrop-blur sm:px-8">
          {chat.error ? (
            <div
              role="alert"
              className="mx-auto flex w-full max-w-[69rem] items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{chat.error}</span>
            </div>
          ) : null}

          {chat.pendingQuestion ? (
            <ChatQuestion question={chat.pendingQuestion} onAnswer={chat.answerQuestion} />
          ) : null}

          <ChatInput
            key={chatId}
            resources={initialData.resources}
            files={files}
            initialOptions={initialData.options}
            placeholder="继续输入消息"
            disabled={chat.isInitializing}
            isRunning={chat.isRunning}
            onStop={chat.stopGenerating}
            onOptionsChange={handleOptionsChange}
            onSubmit={({ request }) => chat.runTurn(request)}
          />
        </div>
      </section>
    </main>
  );
};
