import type { ConversationRenderer, MessageRenderStyle } from "../types";
import { chatConversationRenderer } from "./chat";
import { proseConversationRenderer } from "./prose";

const conversationRenderers: Record<MessageRenderStyle, ConversationRenderer> = {
  chat: chatConversationRenderer,
  prose: proseConversationRenderer,
};

export const resolveConversationRenderer = (renderStyle: MessageRenderStyle) =>
  conversationRenderers[renderStyle] ?? chatConversationRenderer;
