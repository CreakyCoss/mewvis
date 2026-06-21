import type { TavernPresentationRenderStyle } from "../../../types";
import { chatTimelineRenderer } from "./chat";
import { proseTimelineRenderer } from "./prose";
import type { TavernTimelineRenderer } from "./types";

const timelineRenderers: Record<TavernPresentationRenderStyle, TavernTimelineRenderer> = {
  chat: chatTimelineRenderer,
  prose: proseTimelineRenderer,
};

export const resolveTavernTimelineRenderer = (
  renderStyle: TavernPresentationRenderStyle,
) => timelineRenderers[renderStyle] ?? chatTimelineRenderer;

export type {
  TavernTimelineRenderer,
  TavernTimelineRendererProps,
} from "./types";
