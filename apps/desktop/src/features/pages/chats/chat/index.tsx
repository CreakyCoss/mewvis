import { useState } from "react";
import { ChatInput } from "../components/chat-input";
import type { ChatInputOptionValues, ChatInputResources, ChatInputSubmitPayload } from "../components/chat-input/type";

type ChatProps = {
  initialMessages: ChatInputSubmitPayload[];
  inputResources: ChatInputResources;
  inputDefaultOptionValues: ChatInputOptionValues;
};

export const Chat = ({ initialMessages, inputResources, inputDefaultOptionValues }: ChatProps) => {
  const [messages, setMessages] = useState(initialMessages);

  return (
    <main className="flex h-full min-h-0 bg-background text-foreground">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
          <div className="mx-auto flex w-full max-w-[69rem] flex-col gap-5" aria-live="polite">
            {messages.map((message, index) => (
              <article
                key={`${index}-${message.text}`}
                className="ml-auto max-w-[min(42rem,85%)] rounded-2xl bg-muted px-4 py-3 text-sm leading-6 whitespace-pre-wrap"
              >
                {message.text}
              </article>
            ))}
          </div>
        </div>

        <div className="shrink-0 bg-background/95 px-4 py-4 backdrop-blur sm:px-8">
          <ChatInput
            resources={inputResources}
            defaultOptionValues={inputDefaultOptionValues}
            placeholder="继续输入消息"
            onSubmit={(message) => setMessages((current) => [...current, message])}
          />
        </div>
      </section>
    </main>
  );
};
