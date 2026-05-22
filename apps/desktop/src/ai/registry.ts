import type { LlmProvider } from "@/features/llm-settings/types";
import type { ProviderConfig } from "./adapters/base";

export const toProviderConfig = (provider: LlmProvider): ProviderConfig | null => {
  const model = provider.models.find((item) => item.isEnabled);

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
