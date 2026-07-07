import { Fragment } from "react";
import { MessageRow } from "../components/message-row";
import type { TavernConversationRenderer } from "./types";

export const chatConversationRenderer: TavernConversationRenderer = {
  id: "chat",
  Conversation: ({
    messages,
    shouldShowExecutionTrace,
    executionTraceAnchorMessageId,
    hasExecutionTraceAnchor,
    renderExecutionTrace,
    messageEndRef,
  }) => (
    <>
      {messages.map((message) => (
        <Fragment key={message.id}>
          <MessageRow message={message} />
          {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && renderExecutionTrace()}
        </Fragment>
      ))}
      {shouldShowExecutionTrace && !hasExecutionTraceAnchor && renderExecutionTrace()}
      <div ref={messageEndRef} />
    </>
  ),
};
