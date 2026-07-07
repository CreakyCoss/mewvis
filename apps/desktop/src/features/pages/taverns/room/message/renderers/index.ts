import type { TavernPresentationRenderStyle } from "@/features/pages/taverns/manage/model";
import { chatConversationRenderer } from "./chat";
import { proseConversationRenderer } from "./prose";
import type { TavernConversationRenderer } from "./types";

const conversationRenderers: Record<TavernPresentationRenderStyle, TavernConversationRenderer> = {
  chat: chatConversationRenderer,
  prose: proseConversationRenderer,
};

export const resolveTavernConversationRenderer = (renderStyle: TavernPresentationRenderStyle) =>
  conversationRenderers[renderStyle] ?? chatConversationRenderer;
