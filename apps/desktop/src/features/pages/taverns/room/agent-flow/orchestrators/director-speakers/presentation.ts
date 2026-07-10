import type { AgentProtocolOutputKey } from "@/features/pages/taverns/room/agent-protocol/types";
import { dialogueChatPresentationRule } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules/rules/dialogue-chat";
import { novelProsePresentationRule } from "@/features/pages/taverns/tavern/prompt-registry/presentation-rules/rules/novel-prose";
import type { TavernAgentFlowPresentation, TavernAgentFlowSupportedPresentationId } from "../../types";

const dialogueChatPresentation: TavernAgentFlowPresentation = {
  ...dialogueChatPresentationRule,
  id: "dialogue-chat",
};

const novelProsePresentation: TavernAgentFlowPresentation = {
  ...novelProsePresentationRule,
  id: "novel-prose",
};

const supportedPresentations = {
  "dialogue-chat": dialogueChatPresentation,
  "novel-prose": novelProsePresentation,
} satisfies Record<TavernAgentFlowSupportedPresentationId, TavernAgentFlowPresentation>;

export const resolveTavernAgentFlowPresentation = (value: TavernAgentFlowSupportedPresentationId) =>
  supportedPresentations[value];

export const getTavernAgentFlowPublicOutputKey = (
  presentation: TavernAgentFlowPresentation,
): Extract<AgentProtocolOutputKey, "publicReply" | "narrative"> =>
  presentation.id === "novel-prose" ? "narrative" : "publicReply";
