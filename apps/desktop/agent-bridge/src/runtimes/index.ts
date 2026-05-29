import type {
  AgentRuntime,
  BridgeAgent,
  ChatRuntime,
  RuntimeMode,
} from "../contracts/runtime.js";
import { piBridgeAgent } from "./pi/index.js";

export type RuntimeResolution =
  | {
    mode: "agent";
    implementation: AgentRuntime;
  }
  | {
    mode: "chat";
    implementation: ChatRuntime;
  };

const defaultBridgeAgentId = piBridgeAgent.id;

const bridgeAgents = [
  piBridgeAgent,
] satisfies readonly BridgeAgent[];

const createBridgeAgentRegistry = (
  agents: readonly BridgeAgent[],
): Record<string, BridgeAgent> =>
  Object.fromEntries(agents.map((agent) => [agent.id, agent]));

const bridgeAgentRegistry = createBridgeAgentRegistry(bridgeAgents);

export const resolveRuntime = (
  mode: RuntimeMode,
  agentId?: string | null,
): RuntimeResolution => {
  const resolvedAgentId = agentId?.trim() || defaultBridgeAgentId;
  const bridgeAgent = bridgeAgentRegistry[resolvedAgentId];
  if (!bridgeAgent) {
    throw new Error(`未配置 agent：${resolvedAgentId}`);
  }

  if (mode === "agent") {
    const implementation = bridgeAgent.agent;
    if (!implementation) {
      throw new Error(`agent 不支持 agent runtime：${resolvedAgentId}`);
    }

    return {
      mode,
      implementation,
    };
  }

  const implementation = bridgeAgent.chat;
  if (!implementation) {
    throw new Error(`agent 不支持 chat runtime：${resolvedAgentId}`);
  }

  return {
    mode,
    implementation,
  };
};
