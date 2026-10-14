import type {
  DiscoveredProviderModel,
  RuntimeModelCapabilities,
  RuntimeModelLimits,
  RuntimeModelModality,
  RuntimeModelOperation,
} from "@mewvis/chat-contracts";
import schema from "@mewvis/chat-contracts/model-capabilities.schema.json" with { type: "json" };

const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const boolean = (...values: unknown[]) =>
  values.find((value): value is boolean => typeof value === "boolean");
const tokenLimit = (...values: unknown[]) =>
  values.find(
    (value): value is number =>
      typeof value === "number" &&
      Number.isInteger(value) &&
      value > 0 &&
      value <=
        schema.definitions.RuntimeModelLimits.properties.contextWindow.maximum,
  );
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...new Set(value.map(text).filter(Boolean))]
    : undefined;
const modalities = (value: unknown): RuntimeModelModality[] | undefined =>
  strings(value)?.filter((item): item is RuntimeModelModality =>
    schema.definitions.RuntimeModelModality.enum.includes(item),
  );
const operations = (value: unknown): RuntimeModelOperation[] | undefined =>
  strings(value)?.filter((item): item is RuntimeModelOperation =>
    schema.definitions.RuntimeModelOperation.enum.includes(item),
  );

function outputOperations(
  input: RuntimeModelModality[] | undefined,
  output: RuntimeModelModality[],
): RuntimeModelOperation[] {
  const result: RuntimeModelOperation[] = [];
  if (output.includes("text")) result.push("chat");
  if (output.includes("image")) {
    result.push("image-generation");
    if (input?.includes("image")) result.push("image-editing");
  }
  if (output.includes("video")) result.push("video-generation");
  if (output.includes("audio")) result.push("speech");
  return result;
}

/** Normalize documented protocol fields and compatible extensions, without model-name heuristics. */
export function normalizeDiscoveredModel(
  entry: Record<string, unknown>,
  format: string,
): DiscoveredProviderModel | undefined {
  const google = format === "google-generative-ai";
  const modelId = google
    ? text(entry.name).replace(/^models\//, "")
    : text(entry.id);
  if (!modelId) return;
  const result: DiscoveredProviderModel = {
    modelId,
    modelName:
      text(entry.display_name) ||
      text(entry.displayName) ||
      text(entry.name) ||
      modelId,
  };
  const rawLimits = object(entry.limits);
  const topProvider = object(entry.top_provider);
  const limits: RuntimeModelLimits = {};
  const contextWindow = tokenLimit(
    rawLimits?.contextWindow,
    entry.context_length,
    entry.context_window,
    google ? entry.inputTokenLimit : entry.max_input_tokens,
    topProvider?.context_length,
  );
  const maxTokens = tokenLimit(
    rawLimits?.maxTokens,
    google ? entry.outputTokenLimit : undefined,
    entry.max_output_tokens,
    entry.max_completion_tokens,
    topProvider?.max_completion_tokens,
    format === "anthropic-messages" ? entry.max_tokens : undefined,
  );
  if (contextWindow !== undefined) limits.contextWindow = contextWindow;
  // Contradictory or invalid upstream values must not create settings that cannot be saved.
  if (
    maxTokens !== undefined &&
    (contextWindow === undefined || maxTokens <= contextWindow)
  )
    limits.maxTokens = maxTokens;
  if (Object.keys(limits).length) result.limits = limits;

  const raw = object(entry.capabilities);
  const architecture = object(entry.architecture);
  const capabilities: Partial<RuntimeModelCapabilities> = {};
  const input =
    modalities(raw?.input) ??
    modalities(architecture?.input_modalities) ??
    modalities(entry.input_modalities);
  const output =
    modalities(raw?.output) ??
    modalities(architecture?.output_modalities) ??
    modalities(entry.output_modalities);
  const explicitOperations = operations(raw?.operations);
  if (input !== undefined) capabilities.input = input;
  if (output !== undefined) capabilities.output = output;
  if (explicitOperations !== undefined)
    capabilities.operations = explicitOperations;
  else if (output !== undefined)
    capabilities.operations = outputOperations(input, output);

  const supportedParameters = strings(entry.supported_parameters);
  const reasoning = boolean(
    raw?.reasoning,
    object(raw?.thinking)?.supported,
    typeof entry.thinking === "boolean" ? entry.thinking : undefined,
    entry.supports_reasoning,
    supportedParameters
      ? supportedParameters.some((key) =>
          ["reasoning", "reasoning_effort", "include_reasoning"].includes(key),
        )
      : undefined,
  );
  const toolCalling = boolean(
    raw?.toolCalling,
    object(raw?.tool_calling)?.supported,
    entry.supports_tool_calling,
    supportedParameters
      ? supportedParameters.some((key) =>
          ["tools", "tool_choice"].includes(key),
        )
      : undefined,
  );
  if (reasoning !== undefined) capabilities.reasoning = reasoning;
  if (toolCalling !== undefined) capabilities.toolCalling = toolCalling;

  const levels =
    strings(object(entry.thinking)?.levels) ??
    strings(entry.supported_reasoning_efforts) ??
    strings(entry.reasoning_efforts);
  if (levels !== undefined) result.thinking = { levels };
  if (format === "anthropic-messages") {
    const image = boolean(object(raw?.image_input)?.supported);
    if (image !== undefined && input === undefined)
      capabilities.input = image ? ["text", "image"] : ["text"];
    const effort = object(raw?.effort);
    if (effort) {
      const effortLevels = Object.entries(effort)
        .filter(
          ([key, value]) =>
            key !== "supported" && object(value)?.supported === true,
        )
        .map(([key]) => key);
      if (
        effort.supported === false ||
        effort.supported === true ||
        effortLevels.length
      )
        result.thinking = {
          levels: effort.supported === false ? [] : effortLevels,
        };
    }
  }
  if (google && capabilities.operations === undefined) {
    const methods = strings(entry.supportedGenerationMethods);
    if (methods !== undefined)
      capabilities.operations = methods.some((method) =>
        ["generateContent", "generateMessage"].includes(method),
      )
        ? ["chat"]
        : [];
  }
  if (result.thinking?.levels.length && capabilities.reasoning === undefined)
    capabilities.reasoning = true;
  if (capabilities.reasoning === false) delete result.thinking;
  if (Object.keys(capabilities).length) result.capabilities = capabilities;
  return result;
}
