import { recordId } from "../../shared/record-id.js";
import type { LlmRepository } from "./llm-repository.js";
import {
  nonempty,
  object,
  onlyKeys,
  invalid,
  type JsonObject,
} from "../../shared/validation.js";
import { array, boolean, nullableText } from "./normalization.js";
import {
  normalizeModelCapabilities,
  normalizeModelLimits,
  normalizeModelConfiguration,
} from "./model-config.js";
import { MODEL_PROTOCOLS } from "@mewvis/chat-contracts/model-configuration";

export class LlmSettingsService {
  constructor(private readonly repository: LlmRepository) {}

  read() {
    return this.repository.read();
  }

  save(input: JsonObject) {
    onlyKeys(input, ["providers"]);
    const now = Date.now();
    const providers = array(input.providers, "providers").map((value) => {
      const p = object(value, "provider");
      onlyKeys(p, [
        "id",
        "name",
        "provider",
        "apiFormat",
        "apiKey",
        "apiEndpoint",
        "isDefault",
        "models",
      ]);
      const id = recordId(p.id);
      const apiFormat = nonempty(p.apiFormat, "API Format");
      if (
        !MODEL_PROTOCOLS.some(
          (protocol) => protocol !== "http-json" && protocol === apiFormat,
        )
      )
        invalid("Provider 协议无效");
      return {
        id,
        name: nonempty(p.name, "Provider 名称"),
        provider: nonempty(p.provider, "供应商"),
        apiFormat,
        apiKey: nullableText(p.apiKey, "apiKey"),
        apiEndpoint: nullableText(p.apiEndpoint, "apiEndpoint"),
        isDefault: boolean(p.isDefault, "isDefault"),
        createdAt: now,
        updatedAt: now,
        models: array(p.models, "models").map((value) => {
          const m = object(value, "model");
          onlyKeys(m, [
            "id",
            "modelId",
            "modelName",
            "isOneMillionContext",
            "thinking",
            "capabilities",
            "limits",
            "configuration",
          ]);
          return {
            id: recordId(m.id),
            providerId: id,
            modelId: nonempty(m.modelId, "模型 ID"),
            modelName: nonempty(m.modelName, "模型名称"),
            isOneMillionContext: boolean(
              m.isOneMillionContext,
              "isOneMillionContext",
            ),
            thinking: m.thinking ?? null,
            capabilities: normalizeModelCapabilities(m.capabilities),
            limits: normalizeModelLimits(m.limits),
            configuration: normalizeModelConfiguration(m.configuration),
            createdAt: now,
            updatedAt: now,
          };
        }),
      };
    });
    const firstDefault = Math.max(
      0,
      providers.findIndex((provider) => provider.isDefault),
    );
    providers.forEach((provider, index) => {
      provider.isDefault = index === firstDefault;
    });
    return this.repository.replace(providers);
  }
}
