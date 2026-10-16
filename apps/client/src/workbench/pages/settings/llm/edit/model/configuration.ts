import type { ModelConfiguration, ModelPurpose } from "@mewvis/chat-contracts";
import { createModelPurpose } from "@mewvis/chat-contracts/model-configuration";
import { editorPresets } from "../presets";
import { getModelCapabilities, type LlmProviderConfig, type ProviderModelConfig } from "@/agent-client/runtime-model";

export function initialModelConfiguration(
  provider: Pick<LlmProviderConfig, "provider" | "apiFormat">,
  model: ProviderModelConfig,
): ModelConfiguration {
  if (model.configuration) return structuredClone(model.configuration);
  const capabilities = getModelCapabilities(provider, model).declared;
  const presets = editorPresets.getModelTemplates(provider.provider, model.modelId);
  return {
    version: 1,
    purposes: [...new Set([...capabilities.operations, ...presets.map((preset) => preset.purpose.type)])].map(
      (type) => {
        const purpose = suggestPurpose(provider, model, type);
        // A purpose's own media modalities must not be filtered through another purpose's capabilities.
        if (presets.some((preset) => preset.purpose.type === type) && type !== "chat") return purpose;
        return {
          ...purpose,
          input:
            type === "chat" && presets.some((preset) => preset.purpose.type === "chat")
              ? purpose.input.filter((value) => capabilities.input.includes(value))
              : type === "chat" || type === "realtime"
                ? [...capabilities.input]
                : purpose.input.filter((value) => capabilities.input.includes(value)),
          output:
            type === "realtime"
              ? [...capabilities.output]
              : purpose.output.filter((value) => capabilities.output.includes(value)),
          ...(type === "chat" ? { reasoning: capabilities.reasoning, toolCalling: capabilities.toolCalling } : {}),
        };
      },
    ),
  };
}

/** Selecting a different model template fills its request ID and changes supplier connections when needed. */
export function applyPurposeTemplate(
  provider: Pick<LlmProviderConfig, "provider" | "apiFormat">,
  model: ProviderModelConfig,
  current: ModelPurpose,
  id: string,
): ModelPurpose {
  const template = editorPresets.getTemplate(id);
  const next =
    id === "custom-json"
      ? createModelPurpose(current.type, "http-json")
      : editorPresets.instantiateTemplate(id, current.type);
  const previous = editorPresets.getTemplate(current.preset?.id);
  const owner = template?.providerId;
  const supplier = editorPresets.getProvider(provider.provider);
  const retainConnection = !owner || id === current.preset?.id || owner === (previous?.providerId ?? supplier?.id);
  if (retainConnection) {
    const connection = { ...current.connection };
    if (next.adapter === "http-json" || connection.apiFormat === "http-json") delete connection.apiFormat;
    if (Object.keys(connection).length) next.connection = connection;
  } else if (owner !== supplier?.id) {
    const target = editorPresets.getProvider(owner)!;
    const api = target.apis[0];
    next.connection = {
      apiEndpoint: next.adapter === "http-json" ? new URL(api.apiEndpoint).origin : api.apiEndpoint,
      apiKey: "",
      ...(next.adapter === "native" ? { apiFormat: api.apiFormat } : {}),
    };
  }
  if ((!owner || id === current.preset?.id) && current.modelId !== undefined) next.modelId = current.modelId;
  else if (template?.modelId && (template.modelId !== model.modelId.trim() || owner !== supplier?.id))
    next.modelId = template.modelId;
  return next;
}

export function getPurposeConnectionError(providerId: string, configuration: ModelConfiguration | null | undefined) {
  const supplier = editorPresets.getProvider(providerId)?.id;
  for (const purpose of configuration?.purposes ?? []) {
    const owner = editorPresets.getTemplate(purpose.preset?.id)?.providerId;
    if (owner && owner !== supplier) {
      const label = editorPresets.operations.find((option) => option.value === purpose.type)!.label;
      const prefix = `请填写“${label}”用途的 ${editorPresets.getProvider(owner)!.label}`;
      if (!purpose.connection?.apiEndpoint?.trim()) return `${prefix} 请求地址`;
      if (!purpose.connection.apiKey?.trim()) return `${prefix} API Key`;
      if (!purpose.modelId?.trim()) return `${prefix} 请求模型 ID`;
    }
  }
  return "";
}

export function updateModelPurpose(
  provider: Pick<LlmProviderConfig, "provider" | "apiFormat">,
  model: ProviderModelConfig,
  purpose: ModelPurpose,
): ProviderModelConfig {
  const previous = model.configuration!.purposes.find((entry) => entry.type === purpose.type);
  const preset = editorPresets.getTemplate(purpose.preset?.id);
  const apiFormat = purpose.connection?.apiFormat ?? provider.apiFormat;
  const defaults =
    purpose.type === "chat" &&
    purpose.adapter === "native" &&
    apiFormat !== "http-json" &&
    preset?.providerId &&
    preset.modelId &&
    previous?.preset?.id !== preset.id
      ? editorPresets.createModelDefaults({ provider: preset.providerId, apiFormat }, { modelId: preset.modelId })
      : undefined;
  return {
    ...model,
    ...(defaults ? { limits: defaults.limits, thinking: defaults.thinking } : {}),
    configuration: {
      ...model.configuration!,
      purposes: model.configuration!.purposes.map((entry) => (entry.type === purpose.type ? purpose : entry)),
    },
  };
}

export function suggestPurpose(
  provider: Pick<LlmProviderConfig, "provider" | "apiFormat">,
  model: ProviderModelConfig,
  type: ModelPurpose["type"],
): ModelPurpose {
  const preset = editorPresets.suggestTemplate(type, provider.provider, model.modelId);
  return preset ? editorPresets.instantiateTemplate(preset.id, type) : createModelPurpose(type);
}
