import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type { ProviderConfig } from "./adapters/base";

export const toProviderConfig = (
  provider: LlmProvider,
  selectedModel?: ProviderModel,
): ProviderConfig | null => {
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
    model: {
      id: model.id,
      modelId: model.modelId,
      modelName: model.modelName,
    },
  };
};
