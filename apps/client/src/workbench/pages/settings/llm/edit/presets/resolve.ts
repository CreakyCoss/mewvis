import type {
  DiscoveredProviderModel,
  ModelProtocol,
  ModelPurpose,
  RuntimeModelThinking,
} from "@mewvis/chat-contracts";
import type { RuntimeApiFormat } from "@/agent-client/wire";
import { getModelConfigurationError } from "@mewvis/chat-contracts/model-configuration";
import type { CommonPreset, ModelPreset, ProviderPreset } from "./types";

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

  const providers = new Map<
    string,
    Omit<ProviderPreset, "thinking" | "templates"> & {
      thinking: Partial<Record<RuntimeApiFormat, RuntimeModelThinking>>;
    }
  >();
  const templates = new Map<string, { preset: ModelPreset; providerId?: string; pattern?: RegExp }>();
  const register = (entries: readonly ModelPreset[], providerId?: string) => {
    for (const definition of entries) {
      const preset = structuredClone(definition);
      if (!preset.id || templates.has(preset.id)) throw new Error(`模型模板 ID 无效或重复：${preset.id}`);
      if (!preset.label || !Number.isInteger(preset.version) || preset.version < 1)
        throw new Error(`模型模板元数据无效：${preset.id}`);
      const error = getModelConfigurationError({ version: 1, purposes: [preset.purpose] });
      if (error) throw new Error(`模型模板 ${preset.id} 无效：${error}`);
      templates.set(preset.id, {
        preset,
        providerId,
        pattern: preset.match?.modelPattern ? new RegExp(preset.match.modelPattern, "i") : undefined,
      });
    }
  };
  register(common.templates);
  for (const definition of providerDefinitions) {
    const { templates: entries = [], thinking: values = {}, ...provider } = structuredClone(definition);
    if (!provider.id || providers.has(provider.id)) throw new Error(`供应商预设 ID 无效或重复：${provider.id}`);
    const thinking: Partial<Record<RuntimeApiFormat, RuntimeModelThinking>> = {};
    for (const [apiFormat, levels] of Object.entries(values)) {
      thinking[apiFormat as RuntimeApiFormat] = createThinking(levels);
    }
    providers.set(provider.id, { ...provider, thinking });
    register(entries, provider.id);
  }

  const findProvider = (id: string) =>
    providers.get(id) ??
    [...providers.values()].find((provider) => provider.idPrefixes?.some((prefix) => id.startsWith(prefix)));
  const findTemplates = (type?: ModelPurpose["type"]) =>
    [...templates.values()].filter(({ preset }) => !type || preset.purpose.type === type);
  const getTemplate = (id: string | undefined) => {
    const entry = id ? templates.get(id) : undefined;
    return entry ? structuredClone(entry.preset) : undefined;
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
      discovered?: DiscoveredProviderModel,
    ) => {
      const capabilities = {
        ...structuredClone(common.modelDefaults.capabilities),
        ...structuredClone(discovered?.capabilities),
      };
      const limits = { ...common.modelDefaults.limits, ...discovered?.limits };
      // Adjust only fallback values when a reported limit exceeds a generic default.
      if (limits.maxTokens > limits.contextWindow) {
        if (discovered?.limits?.contextWindow !== undefined) limits.maxTokens = limits.contextWindow;
        else limits.contextWindow = limits.maxTokens;
      }
      const thinking = discovered?.thinking
        ? createThinking(discovered.thinking.levels)
        : provider
          ? structuredClone(findProvider(provider.provider)?.thinking[provider.apiFormat] ?? null)
          : null;
      return { capabilities, limits, thinking: capabilities.reasoning ? thinking : null };
    },
    listTemplates: (type?: ModelPurpose["type"]) => findTemplates(type).map(({ preset }) => structuredClone(preset)),
    getTemplate,
    suggestTemplate: (type: ModelPurpose["type"], providerId: string, modelId: string) => {
      const candidates = findTemplates(type);
      const supplier = findProvider(providerId);
      const selected =
        candidates.find(({ preset, providerId: owner, pattern }) => {
          if (owner && owner !== supplier?.id) return false;
          const match = preset.match;
          if (!owner && !match) return false;
          return (
            !match ||
            !(match.modelIds?.length || match.modelPrefixes?.length || match.modelPattern) ||
            match.modelIds?.includes(modelId) ||
            match.modelPrefixes?.some((prefix) => modelId.startsWith(prefix)) ||
            pattern?.test(modelId)
          );
        }) ??
        candidates.find(({ preset, providerId: owner }) => preset.isDefault && (!owner || owner === supplier?.id));
      return selected ? getTemplate(selected.preset.id) : undefined;
    },
    instantiateTemplate: (id: string, type: ModelPurpose["type"]): ModelPurpose => {
      const entry = templates.get(id)?.preset;
      if (!entry || entry.purpose.type !== type) throw new Error("模板不存在或与当前用途不匹配");
      return { ...structuredClone(entry.purpose), preset: { id: entry.id, version: entry.version } };
    },
  };
}
