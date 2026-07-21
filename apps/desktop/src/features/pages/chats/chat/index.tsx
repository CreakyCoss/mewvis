import { CircleAlertIcon } from "lucide-react";
import { ChatInput } from "../components/chat-input";
import { ChatMessages } from "./messages";
import { ChatQuestion } from "./question";
import type { ChatProps } from "./type";
import { useChat } from "./use-chat";

export const Chat = ({ chatId, workspacePath, initialData, onStatusChange }: ChatProps) => {
  const chat = useChat({
    chatId,
    workspacePath,
    initialRequest: initialData.request,
    onStatusChange,
  });

  return (
    <main className="flex h-full min-h-0 bg-background text-foreground">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatMessages
          messages={chat.messages}
          isInitializing={chat.isInitializing}
          pendingQuestionId={chat.pendingQuestion?.questionId}
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
            resources={initialData.resources}
            defaultOptionValues={initialData.request?.optionValues}
            placeholder="继续输入消息"
            disabled={chat.isInitializing}
            isRunning={chat.isRunning}
            onStop={chat.stopGenerating}
            onSubmit={chat.runTurn}
          />
        </div>
      </section>
    </main>
  );
};
