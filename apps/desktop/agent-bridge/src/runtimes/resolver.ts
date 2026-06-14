import type {
  AgentRuntime,
  BridgeAgent,
  ChatRuntime,
  RuntimeMode,
} from "./types.js";
import { resolveBridgeAgent } from "./registry.js";

export type RuntimeResolution =
  | {
    mode: "agent";
    implementation: AgentRuntime;
  }
  | {
    mode: "chat";
    implementation: ChatRuntime;
  };

type RuntimeResolver<TMode extends RuntimeMode, TImplementation> = (
  agent: BridgeAgent,
) => {
  mode: TMode;
  implementation: TImplementation;
};

const runtimeResolvers = {
  agent: (bridgeAgent) => {
    const implementation = bridgeAgent.agent;
    if (!implementation) {
      throw new Error(`agent 不支持 agent runtime：${bridgeAgent.id}`);
    }

    return {
      mode: "agent",
      implementation,
    };
  },
  chat: (bridgeAgent) => {
    const implementation = bridgeAgent.chat;
    if (!implementation) {
      throw new Error(`agent 不支持 chat runtime：${bridgeAgent.id}`);
    }

    return {
      mode: "chat",
      implementation,
    };
  },
} satisfies {
  agent: RuntimeResolver<"agent", AgentRuntime>;
  chat: RuntimeResolver<"chat", ChatRuntime>;
};

export function resolveRuntime(mode: "agent", agentId?: string | null): Extract<RuntimeResolution, { mode: "agent" }>;
export function resolveRuntime(mode: "chat", agentId?: string | null): Extract<RuntimeResolution, { mode: "chat" }>;
export function resolveRuntime(mode: RuntimeMode, agentId?: string | null): RuntimeResolution;
export function resolveRuntime(
  mode: RuntimeMode,
  agentId?: string | null,
): RuntimeResolution {
  const bridgeAgent = resolveBridgeAgent(agentId);
  return runtimeResolvers[mode](bridgeAgent);
}
