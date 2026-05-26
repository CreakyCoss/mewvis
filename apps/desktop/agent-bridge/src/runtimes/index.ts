import type { AgentRuntime, BridgeRuntimeProvider, LlmRuntime, RuntimeMode } from "../contracts/runtime.js";
import { piRuntimeProvider } from "./pi/index.js";

export type RuntimeResolution =
  | {
    mode: "agent";
    runtime: string;
    implementation: AgentRuntime;
  }
  | {
    mode: "llm";
    runtime: string;
    implementation: LlmRuntime;
  };

const defaultRuntimeByMode = {
  agent: piRuntimeProvider.agent.id,
  llm: piRuntimeProvider.llm.id,
} satisfies Record<RuntimeMode, string>;

const runtimeProviders = [
  piRuntimeProvider,
] satisfies readonly BridgeRuntimeProvider[];

const createRuntimeRegistry = (
  providers: readonly BridgeRuntimeProvider[],
): {
  agent: Record<string, AgentRuntime>;
  llm: Record<string, LlmRuntime>;
} => {
  const registry: {
    agent: Record<string, AgentRuntime>;
    llm: Record<string, LlmRuntime>;
  } = {
    agent: {},
    llm: {},
  };

  for (const provider of providers) {
    if (provider.agent) {
      registry.agent[provider.agent.id] = provider.agent;
    }
    if (provider.llm) {
      registry.llm[provider.llm.id] = provider.llm;
    }
  }

  return registry;
};

const runtimeRegistry = createRuntimeRegistry(runtimeProviders);

export const resolveRuntime = (
  mode: RuntimeMode,
  runtimeId?: string | null,
): RuntimeResolution => {
  const runtime = runtimeId?.trim() || defaultRuntimeByMode[mode];

  if (mode === "agent") {
    const implementation = runtimeRegistry.agent[runtime];
    if (!implementation) {
      throw new Error(`未配置 agent runtime：${runtime}`);
    }

    return {
      mode,
      runtime,
      implementation,
    };
  }

  const implementation = runtimeRegistry.llm[runtime];
  if (!implementation) {
    throw new Error(`未配置 llm runtime：${runtime}`);
  }

  return {
    mode,
    runtime,
    implementation,
  };
};
