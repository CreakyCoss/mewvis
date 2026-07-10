import type { AgentProtocolOutputKey } from "@/features/pages/stories/tavern/room/agent-protocol/types";
import type { TavernRoomConfig } from "@/features/pages/stories/tavern/manage/model";
import { getTavernPresentationProfile } from "@/features/pages/stories/tavern/presets/prompts/presentation-rules";
import type { TavernAgentFlowPresentation } from "../../types";

export const resolveTavernAgentFlowPresentation = (roomConfig: TavernRoomConfig): TavernAgentFlowPresentation =>
  getTavernPresentationProfile(roomConfig.presentation.profileId);

export const getTavernAgentFlowPublicOutputKey = (
  presentation: TavernAgentFlowPresentation,
): Extract<AgentProtocolOutputKey, "publicReply" | "narrative"> =>
  presentation.renderStyle === "chat" ? "publicReply" : "narrative";
