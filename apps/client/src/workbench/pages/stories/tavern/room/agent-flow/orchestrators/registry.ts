import type { TavernAgentFlowInput, TavernAgentFlowOrchestrationId, TavernAgentFlowResult } from "../types";
import { directorSpeakersOrchestrator } from "./director-speakers";

export type TavernAgentFlowOrchestrator = {
  id: TavernAgentFlowOrchestrationId;
  run(input: TavernAgentFlowInput): Promise<TavernAgentFlowResult>;
};

const tavernAgentFlowOrchestrators = {
  "director-speakers": directorSpeakersOrchestrator,
} as const satisfies Record<TavernAgentFlowOrchestrationId, TavernAgentFlowOrchestrator>;

export const resolveTavernAgentFlowOrchestrator = (
  id: TavernAgentFlowOrchestrationId = "director-speakers",
): TavernAgentFlowOrchestrator => tavernAgentFlowOrchestrators[id];
