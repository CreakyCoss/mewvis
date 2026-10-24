import { cloneDeep } from "lodash-es";
import type { DiscoveredProviderModel } from "@mewvis/chat-contracts";
import type { RuntimeApiFormat } from "@/agent-client/wire";
import type {
  LlmProvider,
  LlmProviderConfig,
  LlmSettings,
  LlmSettingsConfig,
  ProviderModelConfig,
} from "@/agent-client/runtime-model";
import { createUuid } from "@/utils/ids";
import { getModelLimitsError } from "@/agent-client/runtime-model";
import { getModelConfigurationError } from "@mewvis/chat-contracts/model-configuration";
import { getDefaultApiFormat, getProviderApiFormats, getProviderOption, inferApiEndpoint } from "../options";
import { editorPresets } from "./presets";
import { getPurposeConnectionError, initialModelConfiguration } from "./model/configuration";

export const createModelConfig = (
  provider?: Pick<LlmProviderConfig, "provider" | "apiFormat">,
  discovered?: DiscoveredProviderModel,
): ProviderModelConfig => {
  const model: ProviderModelConfig = {
    id: createUuid(),
    modelId: discovered?.modelId ?? "",
    modelName: discovered?.modelName || discovered?.modelId || "",
    isOneMillionContext: false,
    configuration: null,
    ...editorPresets.createModelDefaults(provider, discovered),
  };
  if (provider && editorPresets.getModel(provider.provider, model.modelId)) {
    model.configuration = initialModelConfiguration(provider, model);
  }
  return model;
};

export const duplicateProviderModel = (provider: LlmProviderConfig, modelId: string): LlmProviderConfig => {
  const index = provider.models.findIndex((model) => model.id === modelId);
  if (index < 0) return provider;
  const source = provider.models[index];
  const name = source.modelName.trim() || source.modelId.trim() || "未命名模型";
  const names = new Set(provider.models.map((model) => model.modelName.trim()));
  let suffix = 1;
  let modelName = `${name}（副本）`;
  while (names.has(modelName)) modelName = `${name}（副本 ${++suffix}）`;
  const copy = { ...cloneDeep(source), id: createUuid(), modelName };
  const models = [...provider.models];
  models.splice(index + 1, 0, copy);
  return { ...provider, models };
};

export const moveProviderModel = (
  provider: LlmProviderConfig,
  modelId: string,
  direction: -1 | 1,
): LlmProviderConfig => {
  const index = provider.models.findIndex((model) => model.id === modelId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= provider.models.length) return provider;
  const models = [...provider.models];
  [models[index], models[target]] = [models[target], models[index]];
  return { ...provider, models };
};

export const initializeModelPreset = (
  provider: Pick<LlmProviderConfig, "provider" | "apiFormat">,
  model: ProviderModelConfig,
): ProviderModelConfig => {
  if (!editorPresets.getModel(provider.provider, model.modelId)) return model;
  const initialized = {
    ...model,
    ...editorPresets.createModelDefaults(provider, { modelId: model.modelId }),
    configuration: null,
  };
  return { ...initialized, configuration: initialModelConfiguration(provider, initialized) };
};

export const appendDiscoveredModels = (
  provider: LlmProviderConfig,
  discovered: DiscoveredProviderModel[],
): LlmProviderConfig => {
  const existing = new Set(provider.models.map((model) => model.modelId.trim()));
  const additions: ProviderModelConfig[] = [];
  for (const model of discovered) {
    if (existing.has(model.modelId)) continue;
    existing.add(model.modelId);
    additions.push(createModelConfig(provider, model));
  }
  return { ...provider, models: [...provider.models, ...additions] };
};

export const createProviderConfig = (isDefault: boolean): LlmProviderConfig => {
  const preset = editorPresets.getDefaultProvider();
  const provider = preset.id;
  const apiFormat = getDefaultApiFormat(provider);

  return {
    id: createUuid(),
    name: preset.label,
    provider,
    apiFormat,
    apiKey: "",
    apiEndpoint: inferApiEndpoint(provider, apiFormat),
    isDefault,
    models: [],
  };
};

export const toLlmSettingsConfig = (settings: LlmSettings): LlmSettingsConfig => {
  const providers = settings.providers.map((provider) => {
    const providerId = provider.provider.trim();
    const apiFormat = provider.apiFormat || getDefaultApiFormat(providerId);

    return {
      id: provider.id,
      name: provider.name,
      provider: providerId,
      apiFormat,
      apiKey: provider.apiKey ?? "",
      apiEndpoint: provider.apiEndpoint ?? inferApiEndpoint(providerId, apiFormat),
      isDefault: provider.isDefault,
      models: provider.models.map((model) => ({
        id: model.id,
        modelId: model.modelId,
        modelName: model.modelName,
        isOneMillionContext: model.isOneMillionContext,
        thinking: model.thinking,
        capabilities: model.capabilities,
        limits: model.limits,
        configuration: model.configuration,
      })),
    };
  });

  return { providers };
};

export const normalizeLlmSettingsConfig = (draft: LlmSettingsConfig): LlmSettingsConfig => {
  const providers = draft.providers.map((provider, index) => ({
    ...provider,
    name: provider.name.trim() || getProviderOption(provider.provider)?.label || provider.provider,
    provider: provider.provider.trim(),
    apiFormat: provider.apiFormat,
    apiKey: provider.apiKey.trim(),
    apiEndpoint: provider.apiEndpoint.trim(),
    isDefault: index === draft.providers.findIndex((item) => item.isDefault),
    models: provider.models.map((model) => ({
      ...model,
      modelId: model.modelId.trim(),
      modelName: model.modelName.trim(),
      isOneMillionContext: model.isOneMillionContext,
      thinking: model.thinking
        ? {
            levels: model.thinking.levels.map((level) => ({
              value: level.value.trim(),
              label: level.label.trim() || level.value.trim(),
            })),
            defaultLevel: model.thinking.defaultLevel || null,
          }
        : null,
      capabilities: model.capabilities ?? null,
      limits: model.limits && Object.keys(model.limits).length ? model.limits : null,
      configuration: model.configuration ?? null,
    })),
  }));

  if (!providers.some((provider) => provider.isDefault) && providers[0]) {
    providers[0] = { ...providers[0], isDefault: true };
  }

  return { providers };
};

export const validateLlmSettingsConfig = (draft: LlmSettingsConfig) => {
  for (const provider of draft.providers) {
    if (!provider.name.trim()) {
      return "Provider 名称不能为空";
    }

    if (!provider.provider.trim()) {
      return "供应商不能为空";
    }

    if (!provider.apiFormat.trim()) {
      return "API Format 不能为空";
    }

    if (!getProviderApiFormats(provider.provider).some((apiFormat) => apiFormat === provider.apiFormat)) {
      return "请选择支持的 API Format";
    }

    if (!provider.apiEndpoint.trim()) {
      return "请填写 API Endpoint";
    }

    for (const model of provider.models) {
      if (!model.modelId.trim()) {
        return "模型 ID 不能为空";
      }

      if (!model.modelName.trim()) {
        return "模型名称不能为空";
      }
      if (model.configuration) {
        const error = getModelConfigurationError(model.configuration);
        if (error) return error;
      }
      const connectionError = getPurposeConnectionError(provider.provider, model.configuration);
      if (connectionError) return connectionError;
      const limitsError = getModelLimitsError(provider, model);
      if (limitsError) return limitsError;
    }
  }

  return "";
};

export const cloneProviderConfig = (provider: LlmProviderConfig): LlmProviderConfig => cloneDeep(provider);

export const toProviderConfig = (provider: LlmProvider) => {
  return toLlmSettingsConfig({ providers: [provider] }).providers[0] ?? null;
};

export const normalizeProvidersForSave = (providers: LlmProviderConfig[], providerId?: string) => {
  const shouldSetDefault = Boolean(providerId && providers.find((provider) => provider.id === providerId)?.isDefault);
  const nextProviders = shouldSetDefault
    ? providers.map((provider) => ({
        ...provider,
        isDefault: provider.id === providerId,
      }))
    : [...providers];

  if (!nextProviders.some((provider) => provider.isDefault) && nextProviders[0]) {
    nextProviders[0] = { ...nextProviders[0], isDefault: true };
  }

  return nextProviders;
};

export const updateProviderIdentifier = (provider: LlmProviderConfig, providerId: string): LlmProviderConfig => {
  const shouldFollowName =
    !provider.name.trim() ||
    provider.name === getProviderOption(provider.provider)?.label ||
    provider.name === provider.provider;
  const apiFormat = getProviderApiFormats(providerId.trim()).includes(provider.apiFormat)
    ? provider.apiFormat
    : getDefaultApiFormat(providerId.trim());
  return {
    ...provider,
    provider: providerId,
    name: shouldFollowName ? providerId : provider.name,
    apiFormat,
  };
};

export const applyProviderDefaults = (provider: LlmProviderConfig, providerId: string): LlmProviderConfig => {
  const currentOption = getProviderOption(provider.provider);
  const nextOption = getProviderOption(providerId);
  if (!nextOption) return updateProviderIdentifier(provider, providerId);
  const apiFormat = getDefaultApiFormat(providerId);
  const shouldFollowName =
    !provider.name.trim() || provider.name === currentOption?.label || provider.name === provider.provider;

  return {
    ...provider,
    provider: providerId,
    apiFormat,
    name: shouldFollowName ? (nextOption?.label ?? providerId) : provider.name,
    apiEndpoint: inferApiEndpoint(providerId, apiFormat),
    models: provider.models,
  };
};

export const applyApiFormatDefaults = (provider: LlmProviderConfig, apiFormat: RuntimeApiFormat): LlmProviderConfig => {
  return {
    ...provider,
    apiFormat,
    apiEndpoint: inferApiEndpoint(provider.provider, apiFormat) || provider.apiEndpoint,
  };
};

export const applyModelDefaults = (
  model: ProviderModelConfig,
  _provider: string,
  modelId: string,
): ProviderModelConfig => {
  const shouldFollowName = !model.modelName.trim() || model.modelName === model.modelId;

  return {
    ...model,
    modelId,
    modelName: shouldFollowName ? modelId : model.modelName,
  };
};
