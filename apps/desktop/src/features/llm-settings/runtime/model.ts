import type { AgentRuntimeModelInput } from "@/ai/agent-runtime/contracts";
import type {
  LlmProvider,
  LlmSettings,
  ProviderModel,
} from "../settings/types";

export type RuntimeModelOption = {
  id: string;
  provider: {
    id: string;
    name: string;
  };
  modelId: string;
  modelName: string;
  runtimeInput: AgentRuntimeModelInput;
};

const ONE_MILLION_CONTEXT_SUFFIX = "[1m]";

const withOneMillionContextSuffix = (value: string, enabled: boolean) => {
  const text = value.trim();

  if (!enabled || text.endsWith(ONE_MILLION_CONTEXT_SUFFIX)) {
    return text;
  }

  return `${text}${ONE_MILLION_CONTEXT_SUFFIX}`;
};

const formatProviderModelId = (
  model: Pick<ProviderModel, "modelId" | "isOneMillionContext">,
) => withOneMillionContextSuffix(model.modelId, model.isOneMillionContext);

const formatProviderModelName = (
  model: Pick<ProviderModel, "modelId" | "modelName" | "isOneMillionContext">,
) => withOneMillionContextSuffix(
  model.modelName.trim() || model.modelId,
  model.isOneMillionContext,
);

const createRuntimeModelInput = (
  provider: LlmProvider,
  model: ProviderModel,
  modelId: string,
): AgentRuntimeModelInput => ({
  provider: provider.provider,
  apiFormat: provider.apiFormat,
  apiKey: provider.apiKey,
  catalogModelId: model.modelId,
  modelId,
  apiEndpoint: provider.apiEndpoint ?? undefined,
});

export const buildRuntimeModelOption = (
  provider: LlmProvider,
  model: ProviderModel,
): RuntimeModelOption => {
  const modelId = formatProviderModelId(model);
  const modelName = formatProviderModelName(model);

  return {
    id: model.id,
    provider: {
      id: provider.id,
      name: provider.name,
    },
    modelId,
    modelName,
    runtimeInput: createRuntimeModelInput(provider, model, modelId),
  };
};

export const buildRuntimeModelOptions = (
  settings: LlmSettings,
): RuntimeModelOption[] =>
  [...settings.providers]
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
    .flatMap((provider) =>
      provider.models
        .filter((model) => model.isEnabled)
        .map((model) => buildRuntimeModelOption(provider, model))
    );

export const findDefaultRuntimeModel = (
  runtimeModels: RuntimeModelOption[],
) => runtimeModels[0] ?? null;

export const findRuntimeModelById = (
  runtimeModels: RuntimeModelOption[],
  id?: string | null,
) => {
  return id ? runtimeModels.find((model) => model.id === id) ?? null : null;
};

export const groupRuntimeModelsByProvider = (
  runtimeModels: RuntimeModelOption[],
) => {
  const groups: Array<{
    providerId: string;
    providerName: string;
    models: RuntimeModelOption[];
  }> = [];

  for (const model of runtimeModels) {
    let group = groups.find((item) => item.providerId === model.provider.id);
    if (!group) {
      group = {
        providerId: model.provider.id,
        providerName: model.provider.name,
        models: [],
      };
      groups.push(group);
    }
    group.models.push(model);
  }

  return groups;
};
