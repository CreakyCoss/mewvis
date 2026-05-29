import type {
  AgentRuntime,
  ChatRuntime,
  RuntimeMode,
} from "../contracts/runtime.js";
import {
  bridgeAgentRegistry,
  DEFAULT_BRIDGE_AGENT_ID,
} from "./registry.js";

export {
  BRIDGE_AGENT_DEFINITIONS,
  bridgeAgents,
  DEFAULT_BRIDGE_AGENT_ID,
} from "./registry.js";

export type RuntimeResolution =
  | {
    mode: "agent";
    implementation: AgentRuntime;
  }
  | {
    mode: "chat";
    implementation: ChatRuntime;
  };

export const resolveRuntime = (
  mode: RuntimeMode,
  agentId?: string | null,
): RuntimeResolution => {
  const resolvedAgentId = agentId?.trim() || DEFAULT_BRIDGE_AGENT_ID;
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
