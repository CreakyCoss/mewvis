import { MODEL_CATALOG } from "./index.js";
import type {
  RuntimeApiFormat,
  RuntimeModelCapabilities,
  RuntimeModelInputModality,
} from "../protocol/wire.js";

export type ModelCapabilityConfig = {
  provider: string;
  modelId: string;
  apiFormat: RuntimeApiFormat;
  capabilities?: RuntimeModelCapabilities | null;
};

// The catalog declares vendor capabilities; the Mewvis Pi adapter currently executes
// text-output conversations with text/image input. Media services have their own adapters.
export const resolveModelCapabilities = (config: ModelCapabilityConfig) => {
  const catalog = Object.prototype.hasOwnProperty.call(
    MODEL_CATALOG,
    config.provider,
  )
    ? MODEL_CATALOG[config.provider]?.models[config.modelId]
    : undefined;
  const preset: RuntimeModelCapabilities = catalog?.capabilities?.[
    config.apiFormat
  ] ?? {
    operations: ["chat"],
    input: catalog ? [...catalog.input] : ["text"],
    output: ["text"],
    reasoning: catalog?.reasoning ?? true,
    toolCalling: true,
  };
  const declared = structuredClone(config.capabilities ?? preset);
  const chatAvailable =
    declared.operations.includes("chat") &&
    declared.input.includes("text") &&
    declared.output.includes("text");
  const input = chatAvailable
    ? declared.input.filter(
        (modality): modality is RuntimeModelInputModality =>
          modality === "text" || modality === "image",
      )
    : [];
  const available: RuntimeModelCapabilities = {
    operations: chatAvailable ? ["chat"] : [],
    input,
    output: chatAvailable ? ["text"] : [],
    reasoning: chatAvailable && declared.reasoning,
    toolCalling: chatAvailable && declared.toolCalling,
  };
  return {
    declared,
    available,
    input,
    source:
      config.capabilities != null ? "custom" : catalog ? "preset" : "fallback",
    sourceUrl: catalog?.capabilitySourceUrl,
  };
};
