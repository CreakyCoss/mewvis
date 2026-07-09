import type { ReactNode, RefObject } from "react";
import type { MessageVisualStyle, RenderableMessage } from "../domain/types";

export type ConversationRendererProps = {
  messages: RenderableMessage[];
  immersiveDescriptionEnabled: boolean;
  isSending: boolean;
  visualStyle: MessageVisualStyle;
  shouldShowExecutionTrace: boolean;
  executionTraceAnchorMessageId: string;
  hasExecutionTraceAnchor: boolean;
  isSidePanelOpen?: boolean;
  renderExecutionTrace: () => ReactNode;
  messageEndRef: RefObject<HTMLDivElement | null>;
};

export type ConversationRenderer = {
  id: string;
  Conversation: (props: ConversationRendererProps) => ReactNode;
};
