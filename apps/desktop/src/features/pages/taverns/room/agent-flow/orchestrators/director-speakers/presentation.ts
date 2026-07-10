import type { AgentProtocolOutputKey } from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { getTavernPresentationProfile } from "@/features/pages/taverns/presets/prompts/presentation-rules";
import type { TavernAgentFlowPresentation } from "../../types";

export const resolveTavernAgentFlowPresentation = (roomConfig: TavernRoomConfig): TavernAgentFlowPresentation =>
  getTavernPresentationProfile(roomConfig.presentation.profileId);

export const getTavernAgentFlowPublicOutputKey = (
  presentation: TavernAgentFlowPresentation,
): Extract<AgentProtocolOutputKey, "publicReply" | "narrative"> =>
  presentation.renderStyle === "chat" ? "publicReply" : "narrative";
