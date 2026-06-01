import type {
  LlmProvider,
  LlmProviderDraft,
  LlmSettings,
  LlmSettingsDraft,
  ProviderModelDraft,
} from "@/ai/llm/types";
import {
  getDefaultProviderType,
  getVendorModelOptions,
  getVendorOption,
  getVendorOptions,
  inferBaseUrl,
} from "./constants";

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const createModelDraft = (): ProviderModelDraft => ({
  id: createId("model"),
  modelId: "",
  modelName: "",
  isEnabled: true,
});

export const createProviderDraft = (): LlmProviderDraft => ({
  id: createId("provider"),
  name: getVendorOption("openai")?.label ?? "Openai",
  vendor: "openai",
  provider: getDefaultProviderType("openai"),
  apiKey: "",
  baseUrl: inferBaseUrl("openai", getDefaultProviderType("openai")),
  isDefault: true,
  models: [
    {
      ...createModelDraft(),
      modelId: getVendorModelOptions("openai", getDefaultProviderType("openai"))[0]?.id ?? "",
      modelName: getVendorModelOptions("openai", getDefaultProviderType("openai"))[0]?.name ?? "",
    },
  ],
});

export const toDraft = (settings: LlmSettings): LlmSettingsDraft => {
  const providers = settings.providers.map((provider) => {
    const vendor = getVendorOption(provider.vendor)?.value ?? "openai";
    const adapterProvider = provider.provider || getDefaultProviderType(vendor);

    return {
      id: provider.id,
      name: provider.name,
      vendor,
      provider: adapterProvider,
      apiKey: provider.apiKey ?? "",
      baseUrl: provider.baseUrl ?? inferBaseUrl(vendor, adapterProvider),
      isDefault: provider.isDefault,
      models: provider.models.map((model) => ({
        id: model.id,
        modelId: model.modelId,
        modelName: model.modelName,
        isEnabled: model.isEnabled,
      })),
    };
  });

  return {
    providers: providers.length ? providers : [createProviderDraft()],
  };
};

export const normalizeDraft = (draft: LlmSettingsDraft): LlmSettingsDraft => {
  const providers = draft.providers.map((provider, index) => ({
    ...provider,
    name: provider.name.trim() || getVendorOption(provider.vendor)?.label || provider.vendor,
    vendor: provider.vendor.trim(),
    provider: provider.provider.trim(),
    apiKey: provider.apiKey.trim(),
    baseUrl: provider.baseUrl.trim(),
    isDefault: index === draft.providers.findIndex((item) => item.isDefault),
    models: provider.models.map((model) => ({
      ...model,
      modelId: model.modelId.trim(),
      modelName: model.modelName.trim(),
    })),
  }));

  if (!providers.some((provider) => provider.isDefault) && providers[0]) {
    providers[0] = { ...providers[0], isDefault: true };
  }

  return { providers };
};

export const validateDraft = (draft: LlmSettingsDraft) => {
  if (draft.providers.length === 0) {
    return "至少添加一个 Provider";
  }

  for (const provider of draft.providers) {
    if (!provider.name.trim()) {
      return "Provider 名称不能为空";
    }

    if (!provider.vendor.trim()) {
      return "供应商不能为空";
    }

    if (!getVendorOption(provider.vendor)) {
      return "请选择支持的供应商";
    }

    if (!provider.provider.trim()) {
      return "Provider 类型不能为空";
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

  if (!draft.providers.some((provider) => provider.models.some((model) => model.isEnabled))) {
    return "至少启用一个模型";
  }

  return "";
};

export const applyProviderDefaults = (
  provider: LlmProviderDraft,
  vendor: string,
): LlmProviderDraft => {
  const currentOption = getVendorOption(provider.vendor);
  const nextOption = getVendorOption(vendor);
  const adapterProvider = getDefaultProviderType(vendor);
  const defaultModel = getVendorModelOptions(vendor, adapterProvider)[0];
  const shouldFollowName =
    !provider.name.trim() ||
    provider.name === currentOption?.label ||
    provider.name === provider.vendor;

  return {
    ...provider,
    vendor,
    provider: adapterProvider,
    name: shouldFollowName ? nextOption?.label ?? vendor : provider.name,
    baseUrl: inferBaseUrl(vendor, adapterProvider),
    models: defaultModel
      ? [
          {
            ...createModelDraft(),
            modelId: defaultModel.id,
            modelName: defaultModel.name,
          },
        ]
      : provider.models,
  };
};

export const applyProviderTypeDefaults = (
  provider: LlmProviderDraft,
  adapterProvider: string,
): LlmProviderDraft => {
  const defaultModel = getVendorModelOptions(provider.vendor, adapterProvider)[0];

  return {
    ...provider,
    provider: adapterProvider,
    baseUrl: inferBaseUrl(provider.vendor, adapterProvider),
    models: defaultModel
      ? [
          {
            ...createModelDraft(),
            modelId: defaultModel.id,
            modelName: defaultModel.name,
          },
        ]
      : provider.models,
  };
};

export const applyModelDefaults = (
  model: ProviderModelDraft,
  vendor: string,
  adapterProvider: string,
  modelId: string,
): ProviderModelDraft => {
  const options = getVendorModelOptions(vendor, adapterProvider);
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

export const findDefaultProvider = (
  providers: LlmProvider[],
): LlmProvider | undefined => {
  return providers.find((provider) => provider.isDefault) ?? providers[0];
};

export const hasVendorOptions = () => {
  return getVendorOptions().length > 0;
};
