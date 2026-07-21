import { CircleAlertIcon } from "lucide-react";
import { ChatInput } from "../components/chat-input";
import { ChatMessages } from "./messages";
import { ChatQuestion } from "./question";
import { useChatRuntime } from "./runtime";
import { useChatStore } from "./store";
import type { ChatProps } from "./type";

export const Chat = ({ chatId, workspacePath, initialData }: ChatProps) => {
  const chatStore = useChatStore();
  const chatRuntime = useChatRuntime({
    chatId,
    workspacePath,
    initialRequest: initialData.request,
  });

  return (
    <main className="flex h-full min-h-0 bg-background text-foreground">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatMessages
          messages={chatStore.messages}
          isInitializing={chatStore.isInitializing}
          pendingQuestionId={chatStore.pendingQuestion?.questionId}
        />

        <div className="shrink-0 space-y-3 bg-background/95 px-4 py-4 backdrop-blur sm:px-8">
          {chatStore.error ? (
            <div
              role="alert"
              className="mx-auto flex w-full max-w-[69rem] items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{chatStore.error}</span>
            </div>
          ) : null}

          {chatStore.pendingQuestion ? (
            <ChatQuestion question={chatStore.pendingQuestion} onAnswer={chatRuntime.answerQuestion} />
          ) : null}

          <ChatInput
            resources={initialData.resources}
            defaultOptionValues={initialData.request?.optionValues}
            placeholder="继续输入消息"
            disabled={chatStore.isInitializing}
            isRunning={Boolean(chatStore.activeTurn)}
            onStop={chatRuntime.stopGenerating}
            onSubmit={chatRuntime.runTurn}
          />
        </div>
      </section>
    </main>
  );
};
