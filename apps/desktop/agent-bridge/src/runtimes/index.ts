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
  bridgeAgentId?: string | null,
): RuntimeResolution => {
  const resolvedBridgeAgentId = bridgeAgentId?.trim() || defaultBridgeAgentId;
  const bridgeAgent = bridgeAgentRegistry[resolvedBridgeAgentId];
  if (!bridgeAgent) {
    throw new Error(`未配置 bridge agent：${resolvedBridgeAgentId}`);
  }

  if (mode === "agent") {
    const implementation = bridgeAgent.agent;
    if (!implementation) {
      throw new Error(`bridge agent 不支持 agent runtime：${resolvedBridgeAgentId}`);
    }

    return {
      mode,
      implementation,
    };
  }

  const implementation = bridgeAgent.chat;
  if (!implementation) {
    throw new Error(`bridge agent 不支持 chat runtime：${resolvedBridgeAgentId}`);
  }

  return {
    mode,
    implementation,
  };
};
