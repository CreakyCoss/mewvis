import { Fragment } from "react";
import type { ConversationRenderer } from "../../types";
import { MessageRow } from "./message-row";

export const chatConversationRenderer: ConversationRenderer = {
  id: "chat",
  Conversation: ({
    messages,
    immersiveDescriptionEnabled,
    isSending,
    visualStyle,
    shouldShowExecutionTrace,
    executionTraceAnchorMessageId,
    hasExecutionTraceAnchor,
    renderExecutionTrace,
    messageEndRef,
  }) => (
    <>
      {messages.map((message) => (
        <Fragment key={message.id}>
          <MessageRow
            message={message}
            immersiveDescriptionEnabled={immersiveDescriptionEnabled}
            isSending={isSending}
            visualStyle={visualStyle}
          />
          {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && renderExecutionTrace()}
        </Fragment>
      ))}
      {shouldShowExecutionTrace && !hasExecutionTraceAnchor && renderExecutionTrace()}
      <div ref={messageEndRef} />
    </>
  ),
};
