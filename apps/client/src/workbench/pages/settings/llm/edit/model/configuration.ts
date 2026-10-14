import type { ModelConfiguration, ModelPurpose } from "@mewvis/chat-contracts";
import { createModelPurpose } from "@mewvis/chat-contracts/model-configuration";
import { editorPresets } from "../presets";
import { getModelCapabilities, type LlmProviderConfig, type ProviderModelConfig } from "@/agent-client/runtime-model";

export function initialModelConfiguration(provider: LlmProviderConfig, model: ProviderModelConfig): ModelConfiguration {
  if (model.configuration) return structuredClone(model.configuration);
  const capabilities = getModelCapabilities(provider, model).declared;
  return {
    version: 1,
    connection: {},
    purposes: capabilities.operations.map((type) => {
      const purpose = suggestPurpose(provider, model, type);
      return {
        ...purpose,
        input:
          type === "chat" || type === "realtime"
            ? [...capabilities.input]
            : purpose.input.filter((value) => capabilities.input.includes(value)),
        output:
          type === "realtime"
            ? [...capabilities.output]
            : purpose.output.filter((value) => capabilities.output.includes(value)),
        ...(type === "chat" ? { reasoning: capabilities.reasoning, toolCalling: capabilities.toolCalling } : {}),
      };
    }),
  };
}

export function suggestPurpose(
  provider: LlmProviderConfig,
  model: ProviderModelConfig,
  type: ModelPurpose["type"],
): ModelPurpose {
  const preset = editorPresets.suggestTemplate(type, provider.provider, model.modelId);
  return preset ? editorPresets.instantiateTemplate(preset.id, type) : createModelPurpose(type);
}
