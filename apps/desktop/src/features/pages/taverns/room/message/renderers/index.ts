import type { MessageRenderStyle } from "../domain/types";
import { chatConversationRenderer } from "./chat";
import { proseConversationRenderer } from "./prose";
import type { ConversationRenderer } from "./types";

const conversationRenderers: Record<MessageRenderStyle, ConversationRenderer> = {
  chat: chatConversationRenderer,
  prose: proseConversationRenderer,
};

export const resolveConversationRenderer = (renderStyle: MessageRenderStyle) =>
  conversationRenderers[renderStyle] ?? chatConversationRenderer;
