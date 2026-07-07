import { Fragment } from "react";
import { MessageRow } from "../components/message-row";
import type { TavernConversationRenderer } from "./types";

export const chatConversationRenderer: TavernConversationRenderer = {
  id: "chat",
  Conversation: ({ messages, messageEndRef }) => (
    <>
      {messages.map((message) => (
        <Fragment key={message.id}>
          <MessageRow message={message} />
        </Fragment>
      ))}
      <div ref={messageEndRef} />
    </>
  ),
};
