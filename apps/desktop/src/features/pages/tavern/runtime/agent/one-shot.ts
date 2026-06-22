import type {
  RuntimeAgentToolName,
  RuntimeModelInput,
} from "@/agent-client/protocol";
import {
  runTavernRuntimeAgent,
  type TavernRuntimeAgentOutput,
} from "./run-agent";

export type RunTavernOneShotAgentInput = {
  agentId?: string | null;
  workspacePath: string;
  agentRoleId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  allowedTools?: RuntimeAgentToolName[];
  enabledSkills?: string[];
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

const fallbackOneShotAgentRoleId = () =>
  `tavern-one-shot-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export const runTavernOneShotAgent = (
  input: RunTavernOneShotAgentInput,
): Promise<TavernRuntimeAgentOutput> =>
  runTavernRuntimeAgent({
    ...input,
    sessionRootDir: null,
    agentRoleId: input.agentRoleId?.trim() || fallbackOneShotAgentRoleId(),
  });
