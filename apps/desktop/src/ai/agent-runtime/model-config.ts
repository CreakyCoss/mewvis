import type { AgentRuntimeModelInput } from "./contracts";

export type RuntimeModelProviderConfig = {
  provider: string;
  apiFormat: string;
  apiKey?: string | null;
  apiEndpoint?: string | null;
};

export type RuntimeModelConfig = {
  modelId: string;
  isOneMillionContext: boolean;
};

const oneMillionContextSuffix = "[1m]";

const resolveRuntimeModelId = (
  model: RuntimeModelConfig,
) => {
  const modelId = model.modelId;

  if (!model.isOneMillionContext || modelId.endsWith(oneMillionContextSuffix)) {
    return modelId;
  }

  return `${modelId}${oneMillionContextSuffix}`;
};

export const createRuntimeModelInputConfig = (
  provider: RuntimeModelProviderConfig,
  model: RuntimeModelConfig,
): AgentRuntimeModelInput => {
  return {
    provider: provider.provider,
    apiFormat: provider.apiFormat,
    apiKey: provider.apiKey,
    catalogModelId: model.modelId,
    modelId: resolveRuntimeModelId(model),
    apiEndpoint: provider.apiEndpoint ?? undefined,
  };
};
