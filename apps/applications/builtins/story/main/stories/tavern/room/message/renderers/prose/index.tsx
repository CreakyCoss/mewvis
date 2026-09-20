import { cn } from "design-system/lib/utils";
import type { ConversationRenderer } from "../../types";
import { ProseMessage } from "./prose-message";

export const proseConversationRenderer: ConversationRenderer = {
  id: "prose",
  Conversation: ({
    messages,
    shouldShowExecutionTrace,
    executionTraceAnchorMessageId,
    hasExecutionTraceAnchor,
    isSidePanelOpen,
    renderExecutionTrace,
    messageEndRef,
  }) => (
    <div className={cn("mx-auto flex w-full flex-col gap-1 py-1", isSidePanelOpen ? "max-w-[44rem]" : "max-w-[46rem]")}>
      {messages.map((message) => (
        <div key={message.id} className="contents">
          <ProseMessage message={message} />
          {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && renderExecutionTrace()}
        </div>
      ))}
      {shouldShowExecutionTrace && !hasExecutionTraceAnchor && renderExecutionTrace()}
      <div ref={messageEndRef} />
    </div>
  ),
};
