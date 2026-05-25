import type { LlmProviderConfig, LlmRuntimeAdapter } from "./base";
import { PiAiLlmRuntimeAdapter } from "./adapters/pi-ai";
import { TauriBridgeLlmRuntimeAdapter } from "./adapters/tauri-bridge";

export type LlmRuntimeAdapterId = "pi-ai" | "system";

export const DEFAULT_LLM_RUNTIME = "pi-ai" satisfies LlmRuntimeAdapterId;

const adapters = {
  [DEFAULT_LLM_RUNTIME]: (config: LlmProviderConfig) => PiAiLlmRuntimeAdapter.create(config),
  system: (config: LlmProviderConfig) => Promise.resolve(new TauriBridgeLlmRuntimeAdapter(config)),
} satisfies Record<LlmRuntimeAdapterId, (config: LlmProviderConfig) => Promise<LlmRuntimeAdapter>>;

export const createLlmRuntimeAdapter = async (
  provider: string,
  config: LlmProviderConfig,
  adapterId: LlmRuntimeAdapterId = DEFAULT_LLM_RUNTIME,
): Promise<LlmRuntimeAdapter> => {
  if (provider !== config.provider) {
    throw new Error(`Provider 类型不匹配：${provider} / ${config.provider}`);
  }

  return adapters[adapterId](config);
};
