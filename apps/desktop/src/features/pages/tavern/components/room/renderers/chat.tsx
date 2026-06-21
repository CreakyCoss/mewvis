import { Fragment } from "react";
import { MessageRow } from "../message-row";
import type { TavernTimelineRenderer } from "./types";

export const chatTimelineRenderer: TavernTimelineRenderer = {
  id: "chat",
  Timeline: ({
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
          {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && (
            renderExecutionTrace()
          )}
        </Fragment>
      ))}
      {shouldShowExecutionTrace && !hasExecutionTraceAnchor && renderExecutionTrace()}
      <div ref={messageEndRef} />
    </>
  ),
};
