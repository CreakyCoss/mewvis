import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import { createRuntimeModelConfig } from "@/features/llm-settings/model-catalog";
import type { LlmProviderConfig } from "./base";

export const toLlmProviderConfig = (
  provider: LlmProvider,
  selectedModel?: ProviderModel,
): LlmProviderConfig | null => {
  const model = selectedModel ?? provider.models.find((item) => item.isEnabled);

  if (!model) {
    return null;
  }

  return {
    id: provider.id,
    name: provider.name,
    vendor: provider.vendor,
    provider: provider.provider,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model: createRuntimeModelConfig(provider, model),
  };
};
