import type { ReactNode, RefObject } from "react";
import type { TavernRenderableMessage } from "../../../core";

export type TavernConversationRendererProps = {
  messages: TavernRenderableMessage[];
  shouldShowExecutionTrace: boolean;
  executionTraceAnchorMessageId: string;
  hasExecutionTraceAnchor: boolean;
  renderExecutionTrace: () => ReactNode;
  messageEndRef: RefObject<HTMLDivElement | null>;
};

export type TavernConversationRenderer = {
  id: string;
  Conversation: (props: TavernConversationRendererProps) => ReactNode;
};
