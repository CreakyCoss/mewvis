import type { ReactNode, RefObject } from "react";
import type { TavernRenderableMessage } from "../../../core";

export type TavernTimelineRendererProps = {
  messages: TavernRenderableMessage[];
  shouldShowExecutionTrace: boolean;
  executionTraceAnchorMessageId: string;
  hasExecutionTraceAnchor: boolean;
  renderExecutionTrace: () => ReactNode;
  messageEndRef: RefObject<HTMLDivElement | null>;
};

export type TavernTimelineRenderer = {
  id: string;
  Timeline: (props: TavernTimelineRendererProps) => ReactNode;
};
