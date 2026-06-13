import {
  getProviderApiFormats,
  getProviderOption,
  getProviderOptions,
} from "../options";
import type {
  LlmProvider,
  LlmProviderConfig,
  LlmSettings,
  LlmSettingsConfig,
  ProviderModelConfig,
} from "../types";
import {
  getDefaultApiFormat,
  getProviderModelOptions,
  inferApiEndpoint,
} from "./form";

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const createModelConfig = (): ProviderModelConfig => ({
  id: createId("model"),
  modelId: "",
  modelName: "",
  isEnabled: true,
  isOneMillionContext: false,
});

export const createProviderConfig = (
  isDefault: boolean,
): LlmProviderConfig => {
  const providerOption =
    getProviderOption("openai") ??
    getProviderOptions()[0] ??
    {
      value: "openai",
      label: "OpenAI",
    };
  const provider = providerOption.value;
  const apiFormat = getDefaultApiFormat(provider);
  const defaultModel = getProviderModelOptions(provider)[0];

  return {
    id: createId("provider"),
    name: providerOption.label,
    provider,
    apiFormat,
    apiKey: "",
    apiEndpoint: inferApiEndpoint(provider, apiFormat),
    isDefault,
    models: [
      {
        ...createModelConfig(),
        modelId: defaultModel?.id ?? "",
        modelName: defaultModel?.name ?? "",
      },
    ],
  };
};

export const toLlmSettingsConfig = (
  settings: LlmSettings,
): LlmSettingsConfig => {
  const providers = settings.providers.map((provider) => {
    const providerId =
      getProviderOption(provider.provider)?.value ??
      getProviderOptions()[0]?.value ??
      "openai";
    const apiFormat = provider.apiFormat || getDefaultApiFormat(providerId);

    return {
      id: provider.id,
      name: provider.name,
      provider: providerId,
      apiFormat,
      apiKey: provider.apiKey ?? "",
      apiEndpoint:
        provider.apiEndpoint ?? inferApiEndpoint(providerId, apiFormat),
      isDefault: provider.isDefault,
      models: provider.models.map((model) => ({
        id: model.id,
        modelId: model.modelId,
        modelName: model.modelName,
        isEnabled: model.isEnabled,
        isOneMillionContext: model.isOneMillionContext,
      })),
    };
  });

  return { providers };
};

export const normalizeLlmSettingsConfig = (
  draft: LlmSettingsConfig,
): LlmSettingsConfig => {
  const providers = draft.providers.map((provider, index) => ({
    ...provider,
    name:
      provider.name.trim() ||
      getProviderOption(provider.provider)?.label ||
      provider.provider,
    provider: provider.provider.trim(),
    apiFormat: provider.apiFormat.trim(),
    apiKey: provider.apiKey.trim(),
    apiEndpoint: provider.apiEndpoint.trim(),
    isDefault: index === draft.providers.findIndex((item) => item.isDefault),
    models: provider.models.map((model) => ({
      ...model,
      modelId: model.modelId.trim(),
      modelName: model.modelName.trim(),
      isOneMillionContext: model.isOneMillionContext,
    })),
  }));

  if (!providers.some((provider) => provider.isDefault) && providers[0]) {
    providers[0] = { ...providers[0], isDefault: true };
  }

  return { providers };
};

export const validateLlmSettingsConfig = (draft: LlmSettingsConfig) => {
  if (draft.providers.length === 0) {
    return "至少添加一个 Provider";
  }

  for (const provider of draft.providers) {
    if (!provider.name.trim()) {
      return "Provider 名称不能为空";
    }

    if (!provider.provider.trim()) {
      return "供应商不能为空";
    }

    if (!getProviderOption(provider.provider)) {
      return "请选择支持的供应商";
    }

    if (!provider.apiFormat.trim()) {
      return "API Format 不能为空";
    }

    if (
      !getProviderApiFormats(provider.provider).some(
        (apiFormat) => apiFormat === provider.apiFormat,
      )
    ) {
      return "请选择支持的 API Format";
    }

    if (provider.models.length === 0) {
      return "每个 Provider 至少需要一个模型";
    }

    for (const model of provider.models) {
      if (!model.modelId.trim()) {
        return "模型 ID 不能为空";
      }

      if (!model.modelName.trim()) {
        return "模型名称不能为空";
      }
    }
  }

  if (
    !draft.providers.some((provider) =>
      provider.models.some((model) => model.isEnabled),
    )
  ) {
    return "至少启用一个模型";
  }

  return "";
};

export const cloneProviderConfig = (
  provider: LlmProviderConfig,
): LlmProviderConfig => ({
  ...provider,
  models: provider.models.map((model) => ({ ...model })),
});

export const toProviderConfig = (provider: LlmProvider) => {
  return toLlmSettingsConfig({ providers: [provider] }).providers[0] ?? null;
};

export const normalizeProvidersForSave = (
  providers: LlmProviderConfig[],
  providerId?: string,
) => {
  const shouldSetDefault = Boolean(
    providerId &&
      providers.find((provider) => provider.id === providerId)?.isDefault,
  );
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

export const applyProviderDefaults = (
  provider: LlmProviderConfig,
  providerId: string,
): LlmProviderConfig => {
  const currentOption = getProviderOption(provider.provider);
  const nextOption = getProviderOption(providerId);
  const apiFormat = getDefaultApiFormat(providerId);
  const defaultModel = getProviderModelOptions(providerId)[0];
  const shouldFollowName =
    !provider.name.trim() ||
    provider.name === currentOption?.label ||
    provider.name === provider.provider;

  return {
    ...provider,
    provider: providerId,
    apiFormat,
    name: shouldFollowName ? nextOption?.label ?? providerId : provider.name,
    apiEndpoint: inferApiEndpoint(providerId, apiFormat),
    models: defaultModel
      ? [
          {
            ...createModelConfig(),
            modelId: defaultModel.id,
            modelName: defaultModel.name,
          },
        ]
      : provider.models,
  };
};

export const applyApiFormatDefaults = (
  provider: LlmProviderConfig,
  apiFormat: string,
): LlmProviderConfig => {
  return {
    ...provider,
    apiFormat,
    apiEndpoint: inferApiEndpoint(provider.provider, apiFormat),
  };
};

export const applyModelDefaults = (
  model: ProviderModelConfig,
  provider: string,
  modelId: string,
): ProviderModelConfig => {
  const options = getProviderModelOptions(provider);
  const currentOption = options.find((item) => item.id === model.modelId);
  const option = options.find((item) => item.id === modelId);
  const shouldFollowName =
    !model.modelName.trim() || model.modelName === currentOption?.name;

  return {
    ...model,
    modelId,
    modelName: option?.name ?? (shouldFollowName ? modelId : model.modelName),
  };
};
