import type { AgentProtocolOutputKey } from "../../../agent-protocol/types";
import type { TavernRoomConfig } from "../../../../manage/model";
import { getTavernPresentationProfile } from "../../../../presets/prompts/presentation-rules";
import type { TavernAgentFlowPresentation } from "../../types";

export const resolveTavernAgentFlowPresentation = (roomConfig: TavernRoomConfig): TavernAgentFlowPresentation =>
  getTavernPresentationProfile(roomConfig.presentation.profileId);

export const getTavernAgentFlowPublicOutputKey = (
  presentation: TavernAgentFlowPresentation,
): Extract<AgentProtocolOutputKey, "publicReply" | "narrative"> =>
  presentation.renderStyle === "chat" ? "publicReply" : "narrative";
