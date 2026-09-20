import { createRenderableMessages } from "./normalization";
import { resolveConversationRenderer } from "./renderers/registry";
import type { ConversationRenderer, MessageNormalizationRequest, MessageRenderStyle, RenderableMessage } from "./types";

export type Message = {
  normalize(request: MessageNormalizationRequest): RenderableMessage[];
  resolveRenderer(renderStyle: MessageRenderStyle): ConversationRenderer;
};

export const Message: Message = {
  normalize(request: MessageNormalizationRequest): RenderableMessage[] {
    return createRenderableMessages(request);
  },
  resolveRenderer(renderStyle: MessageRenderStyle): ConversationRenderer {
    return resolveConversationRenderer(renderStyle);
  },
} as const;
