import type {
  DiscoveredProviderModel,
  ModelProtocol,
  ModelPurpose,
  RuntimeModelCapabilities,
  RuntimeModelThinking,
} from "@mewvis/chat-contracts";
import type { RuntimeApiFormat } from "@/agent-client/wire";
import { getModelConfigurationError } from "@mewvis/chat-contracts/model-configuration";
import type { CommonPreset, ModelPreset, ProviderPreset, PurposePreset } from "./types";

/** The single transformation from shared/supplier definitions to the editor's preset API. */
export function createEditorPresets(commonDefinition: CommonPreset, providerDefinitions: readonly ProviderPreset[]) {
  const common = structuredClone(commonDefinition);
  const thinkingLabels = new Map(common.thinkingLevels.map((level) => [level.value, level.label]));
  const createThinking = (values: readonly string[]): RuntimeModelThinking => {
    const unique = new Set(values);
    const ordered = [...thinkingLabels.keys()].filter((value) => unique.has(value));
    ordered.push(...[...unique].filter((value) => !thinkingLabels.has(value)));
    return {
      levels: ordered.map((value) => ({ value, label: thinkingLabels.get(value) ?? value })),
      defaultLevel: null,
    };
  };
  const protocols = new Map(common.protocols.map((protocol) => [protocol.value, protocol]));
  const nativeProtocols = common.protocols.filter(
    (protocol): protocol is { value: RuntimeApiFormat; label: string; apiEndpoint?: string } =>
      protocol.value !== "http-json",
  );
  if (!nativeProtocols.length) throw new Error("通用预设至少需要一个原生协议");

  const providers = new Map<string, ProviderPreset>();
  type Template = PurposePreset & { providerId?: string; modelId?: string };
  const templates = new Map<string, Template>();
  const register = (entries: readonly PurposePreset[], provider?: ProviderPreset, model?: ModelPreset) => {
    const defaults = new Set<ModelPurpose["type"]>();
    for (const definition of entries) {
      const preset = structuredClone(definition);
      if (!preset.id || templates.has(preset.id)) throw new Error(`模型模板 ID 无效或重复：${preset.id}`);
      if (!preset.label || !Number.isInteger(preset.version) || preset.version < 1)
        throw new Error(`模型模板元数据无效：${preset.id}`);
      const error = getModelConfigurationError({ version: 1, purposes: [preset.purpose] });
      if (error) throw new Error(`模型模板 ${preset.id} 无效：${error}`);
      if (preset.isDefault) {
        if (defaults.has(preset.purpose.type)) throw new Error(`用途默认模板重复：${model?.modelId ?? "common"}`);
        defaults.add(preset.purpose.type);
      }
      templates.set(preset.id, {
        ...preset,
        sourceUrl: preset.sourceUrl ?? model?.sourceUrls[0],
        ...(provider && model
          ? {
              providerId: provider.id,
              modelId: model.modelId,
              label: `${provider.label} · ${model.label} · ${preset.label}`,
            }
          : {}),
      });
    }
  };
  register(common.templates);
  for (const definition of providerDefinitions) {
    const provider = structuredClone(definition);
    if (!provider.id || providers.has(provider.id)) throw new Error(`供应商预设 ID 无效或重复：${provider.id}`);
    const modelIds = new Set<string>();
    for (const model of provider.models) {
      if (!model.modelId.trim() || modelIds.has(model.modelId))
        throw new Error(`型号预设 ID 无效或重复：${model.modelId}`);
      if (!model.templates.length) throw new Error(`型号预设至少需要一个用途模板：${model.modelId}`);
      modelIds.add(model.modelId);
      register(model.templates, provider, model);
    }
    providers.set(provider.id, provider);
  }

  const findProvider = (id: string) =>
    providers.get(id) ??
    [...providers.values()].find((provider) => provider.idPrefixes?.some((prefix) => id.startsWith(prefix)));
  const findModel = (providerId: string, modelId: string) =>
    findProvider(providerId)?.models.find((model) => model.modelId === modelId.trim());
  const findTemplates = (type?: ModelPurpose["type"]) =>
    [...templates.values()].filter((preset) => !type || preset.purpose.type === type);
  const defaultTemplates = (entries: readonly PurposePreset[]) => {
    const selected = new Map<ModelPurpose["type"], PurposePreset>();
    for (const entry of entries) {
      if (!selected.has(entry.purpose.type) || entry.isDefault) selected.set(entry.purpose.type, entry);
    }
    return [...selected.values()];
  };
  const getTemplate = (id: string | undefined) => {
    const entry = id ? templates.get(id) : undefined;
    return entry ? structuredClone(entry) : undefined;
  };
  const getApiFormats = (providerId: string) =>
    [
      ...new Set([
        ...(findProvider(providerId)?.apis.map((api) => api.apiFormat) ?? []),
        ...nativeProtocols.map((protocol) => protocol.value),
      ]),
    ].map((value) => ({ value, label: protocols.get(value)?.label ?? value }));

  return {
    protocols: structuredClone(common.protocols),
    modalities: structuredClone(common.modalities),
    operations: structuredClone(common.operations),
    thinkingLevels: structuredClone(common.thinkingLevels),
    sampleInput: structuredClone(common.sampleInput),
    listProviders: () => [...providers.values()].map((provider) => structuredClone(provider)),
    getDefaultProvider: () => {
      const provider = providers.get(common.defaultProvider) ?? providers.values().next().value;
      if (!provider) throw new Error("没有可用的供应商预设");
      return structuredClone(provider);
    },
    getProvider: (id: string) => {
      const provider = findProvider(id);
      return provider ? structuredClone(provider) : undefined;
    },
    getModel: (providerId: string, modelId: string) => {
      const model = findModel(providerId, modelId);
      return model ? structuredClone(model) : undefined;
    },
    getModelTemplates: (providerId: string, modelId: string) =>
      defaultTemplates(findModel(providerId, modelId)?.templates ?? []).map((preset) => getTemplate(preset.id)!),
    getApiFormatLabel: (format: string) => protocols.get(format as ModelProtocol)?.label ?? format,
    getApiFormats,
    getDefaultApiFormat: (providerId: string): RuntimeApiFormat =>
      findProvider(providerId)?.apis[0]?.apiFormat ?? nativeProtocols[0].value,
    getApiEndpoint: (providerId: string, format: RuntimeApiFormat) =>
      findProvider(providerId)?.apis.find((api) => api.apiFormat === format)?.apiEndpoint ??
      protocols.get(format)?.apiEndpoint ??
      "",
    createModelDefaults: (
      provider?: { provider: string; apiFormat: RuntimeApiFormat },
      discovered?: Pick<DiscoveredProviderModel, "modelId"> & Partial<DiscoveredProviderModel>,
    ) => {
      const model = provider ? findModel(provider.provider, discovered?.modelId ?? "") : undefined;
      const purposes = defaultTemplates(model?.templates ?? []).map((preset) => preset.purpose);
      const chat = purposes.find((purpose) => purpose.type === "chat");
      const modelCapabilities: RuntimeModelCapabilities | undefined = purposes.length
        ? {
            operations: purposes.map((purpose) => purpose.type),
            input: [...new Set(purposes.flatMap((purpose) => purpose.input))],
            output: [...new Set(purposes.flatMap((purpose) => purpose.output))],
            reasoning: chat?.reasoning ?? false,
            toolCalling: chat?.toolCalling ?? false,
          }
        : undefined;
      const capabilities = structuredClone({
        ...common.modelDefaults.capabilities,
        ...modelCapabilities,
        ...discovered?.capabilities,
      });
      const limits = { ...common.modelDefaults.limits, ...model?.limits, ...discovered?.limits };
      if (limits.maxTokens > limits.contextWindow) {
        if (discovered?.limits?.contextWindow !== undefined) limits.maxTokens = limits.contextWindow;
        else limits.contextWindow = limits.maxTokens;
      }
      const levels = discovered?.thinking?.levels ?? (provider ? model?.thinking?.[provider.apiFormat] : undefined);
      return { capabilities, limits, thinking: capabilities.reasoning && levels ? createThinking(levels) : null };
    },
    listTemplates: (type?: ModelPurpose["type"]) => findTemplates(type).map((preset) => structuredClone(preset)),
    getTemplate,
    suggestTemplate: (type: ModelPurpose["type"], providerId: string, modelId: string) => {
      const selected =
        defaultTemplates(findModel(providerId, modelId)?.templates ?? []).find(
          (preset) => preset.purpose.type === type,
        ) ?? common.templates.find((preset) => preset.purpose.type === type && preset.isDefault);
      return selected ? getTemplate(selected.id) : undefined;
    },
    instantiateTemplate: (id: string, type: ModelPurpose["type"]): ModelPurpose => {
      const entry = templates.get(id);
      if (!entry || entry.purpose.type !== type) throw new Error("模板不存在或与当前用途不匹配");
      return { ...structuredClone(entry.purpose), preset: { id: entry.id, version: entry.version } };
    },
  };
}
