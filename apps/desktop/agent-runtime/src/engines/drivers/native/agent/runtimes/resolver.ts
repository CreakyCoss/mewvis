import type { AgentRuntime, RuntimeAgent, ChatRuntime, RuntimeMode } from "./types.js";
import { resolveRuntimeAgent } from "./registry.js";

export type RuntimeResolution =
  | {
      mode: "agent";
      runtimeId: string;
      implementation: AgentRuntime;
    }
  | {
      mode: "chat";
      runtimeId: string;
      implementation: ChatRuntime;
    };

type RuntimeResolver<TMode extends RuntimeMode, TImplementation> = (agent: RuntimeAgent) => {
  mode: TMode;
  implementation: TImplementation;
};

const runtimeResolvers = {
  agent: (runtimeAgent) => {
    const implementation = runtimeAgent.agent;
    if (!implementation) {
      throw new Error(`agent 不支持 agent runtime：${runtimeAgent.id}`);
    }

    return {
      mode: "agent",
      runtimeId: runtimeAgent.id,
      implementation,
    };
  },
  chat: (runtimeAgent) => {
    const implementation = runtimeAgent.chat;
    if (!implementation) {
      throw new Error(`agent 不支持 chat runtime：${runtimeAgent.id}`);
    }

    return {
      mode: "chat",
      runtimeId: runtimeAgent.id,
      implementation,
    };
  },
} satisfies {
  agent: RuntimeResolver<"agent", AgentRuntime>;
  chat: RuntimeResolver<"chat", ChatRuntime>;
};

export function resolveRuntime(mode: "agent", runtimeId?: string | null): Extract<RuntimeResolution, { mode: "agent" }>;
export function resolveRuntime(mode: "chat", runtimeId?: string | null): Extract<RuntimeResolution, { mode: "chat" }>;
export function resolveRuntime(mode: RuntimeMode, runtimeId?: string | null): RuntimeResolution;
export function resolveRuntime(mode: RuntimeMode, runtimeId?: string | null): RuntimeResolution {
  const runtimeAgent = resolveRuntimeAgent(runtimeId);
  return runtimeResolvers[mode](runtimeAgent);
}
