import { resolveTavernAgentFlowOrchestrator } from "./orchestrators/registry";
import { deleteTavernAgentFlowSession } from "./runtime/session";
import type { TavernAgentFlowInput, TavernAgentFlowResult, TavernAgentFlowSessionInput } from "./types";

export type TavernAgentFlow = {
  run(input: TavernAgentFlowInput): Promise<TavernAgentFlowResult>;
  deleteSession(input: TavernAgentFlowSessionInput): Promise<void>;
};

export const TavernAgentFlow: TavernAgentFlow = {
  run(input: TavernAgentFlowInput): Promise<TavernAgentFlowResult> {
    return resolveTavernAgentFlowOrchestrator(input.orchestration).run(input);
  },
  deleteSession(input: TavernAgentFlowSessionInput): Promise<void> {
    return deleteTavernAgentFlowSession(input);
  },
} as const;
