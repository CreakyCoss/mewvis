import type { AgentRuntimeModelInput } from "@/ai/agent-runtime/contracts";
import { createRuntimeModelInputConfig } from "@/ai/agent-runtime/model-config";
import { formatProviderModelName } from "./display";
import type {
  LlmProvider,
  LlmSettings,
  ProviderModel,
} from "./types";

export type RuntimeModelOption = {
  key: string;
  provider: {
    id: string;
    name: string;
  };
  modelId: string;
  modelName: string;
  runtimeInput: AgentRuntimeModelInput;
};

export const runtimeModelKey = (
  providerId: string,
  modelSettingId: string,
) => `${providerId}:${modelSettingId}`;

export const buildRuntimeModelOption = (
  provider: LlmProvider,
  model: ProviderModel,
): RuntimeModelOption => {
  const runtimeInput = createRuntimeModelInputConfig(provider, model);
  const modelLabel = formatProviderModelName(model);

  return {
    key: runtimeModelKey(provider.id, model.id),
    provider: {
      id: provider.id,
      name: provider.name,
    },
    modelId: model.id,
    modelName: modelLabel,
    runtimeInput,
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

export const findRuntimeModelByKey = (
  runtimeModels: RuntimeModelOption[],
  key?: string | null,
) => key ? runtimeModels.find((model) => model.key === key) ?? null : null;

export const findRuntimeModelByLegacyIds = (
  runtimeModels: RuntimeModelOption[],
  providerId?: string | null,
  modelSettingId?: string | null,
) => runtimeModels.find((model) =>
  model.provider.id === providerId &&
  model.modelId === modelSettingId
) ?? null;

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
