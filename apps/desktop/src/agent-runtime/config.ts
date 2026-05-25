import { createRuntimeModelConfig } from "@/features/llm-settings/model-catalog";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type { CodingAgentModelConfig, CodingAgentProviderConfig } from "./contract";

export const toCodingAgentProviderConfig = (
  provider: LlmProvider,
): CodingAgentProviderConfig => ({
  id: provider.id,
  name: provider.name,
  vendor: provider.vendor,
  provider: provider.provider,
  apiKey: provider.apiKey,
  baseUrl: provider.baseUrl,
});

export const toCodingAgentModelConfig = (
  provider: Pick<LlmProvider, "vendor" | "provider" | "baseUrl">,
  model: ProviderModel,
): CodingAgentModelConfig => createRuntimeModelConfig(provider, model);
