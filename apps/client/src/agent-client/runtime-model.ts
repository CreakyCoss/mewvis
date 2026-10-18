import type { ModelConfiguration, ModelMediaPurpose } from "@mewvis/chat-contracts";
import { getModelConfigurationError, resolveModelConnection } from "@mewvis/chat-contracts/model-configuration";
import type {
  RuntimeApiFormat,
  RuntimeModelInput,
  RuntimeModelThinking,
  RuntimeModelCapabilities,
  RuntimeModelLimits,
} from "./wire";

export type ProviderModel = {
  id: string;
  providerId: string;
  modelId: string;
  modelName: string;
  isOneMillionContext: boolean;
  thinking?: RuntimeModelThinking | null;
  capabilities?: RuntimeModelCapabilities | null;
  limits?: RuntimeModelLimits | null;
  configuration?: ModelConfiguration | null;
  createdAt: number;
  updatedAt: number;
};

export type LlmProvider = {
  id: string;
  name: string;
  provider: string;
  apiFormat: RuntimeApiFormat;
  apiKey?: string | null;
  apiEndpoint?: string | null;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  models: ProviderModel[];
};

export type LlmSettings = {
  providers: LlmProvider[];
};

export type ProviderModelConfig = Omit<ProviderModel, "createdAt" | "updatedAt" | "providerId">;

export type LlmProviderConfig = Omit<LlmProvider, "apiEndpoint" | "apiKey" | "createdAt" | "updatedAt" | "models"> & {
  apiKey: string;
  apiEndpoint: string;
  models: ProviderModelConfig[];
};

export type LlmSettingsConfig = {
  providers: LlmProviderConfig[];
};

export type RuntimeModelOption = {
  id: string;
  provider: {
    id: string;
    name: string;
  };
  modelId: string;
  modelName: string;
  thinking?: RuntimeModelThinking;
  capabilities: RuntimeModelCapabilities;
  mediaPurposes: ModelMediaPurpose[];
};

export type RuntimeModelInputMap = Record<string, RuntimeModelInput>;

const ONE_MILLION_CONTEXT_SUFFIX = "[1m]";

const withOneMillionContextSuffix = (value: string, enabled: boolean) => {
  const text = value.trim();

  if (!enabled || text.endsWith(ONE_MILLION_CONTEXT_SUFFIX)) {
    return text;
  }

  return `${text}${ONE_MILLION_CONTEXT_SUFFIX}`;
};

const formatProviderModelId = (model: Pick<ProviderModel, "modelId" | "isOneMillionContext">) =>
  withOneMillionContextSuffix(model.modelId, model.isOneMillionContext);

const formatProviderModelName = (model: Pick<ProviderModel, "modelId" | "modelName" | "isOneMillionContext">) =>
  withOneMillionContextSuffix(model.modelName.trim() || model.modelId, model.isOneMillionContext);

const availableChatCapabilities = (declared: RuntimeModelCapabilities, enabled = true): RuntimeModelCapabilities => {
  const chat =
    enabled &&
    declared.operations.includes("chat") &&
    declared.input.includes("text") &&
    declared.output.includes("text");
  return {
    operations: chat ? ["chat"] : [],
    input: chat ? declared.input.filter((value) => value === "text" || value === "image") : [],
    output: chat ? ["text"] : [],
    reasoning: chat && declared.reasoning,
    toolCalling: chat && declared.toolCalling,
  };
};

export const getModelCapabilities = (
  provider: Pick<LlmProvider, "provider" | "apiFormat">,
  model: Pick<ProviderModel, "modelId" | "capabilities" | "configuration">,
) => {
  const configuration = model.configuration;
  const chat = configuration?.purposes.find((purpose) => purpose.type === "chat");
  const apiFormat = chat?.connection?.apiFormat ?? provider.apiFormat;
  const capabilities = configuration
    ? {
        operations: configuration.purposes.map((purpose) => purpose.type),
        input: [...new Set(configuration.purposes.flatMap((purpose) => purpose.input))],
        output: [...new Set(configuration.purposes.flatMap((purpose) => purpose.output))],
        reasoning: chat?.reasoning ?? false,
        toolCalling: chat?.toolCalling ?? false,
      }
    : model.capabilities;
  const declared: RuntimeModelCapabilities = structuredClone(
    capabilities ?? { operations: ["chat"], input: ["text"], output: ["text"], reasoning: true, toolCalling: true },
  );
  // The bridge reads submitted configuration only; editor presets never participate in execution.
  const available = configuration
    ? availableChatCapabilities(
        {
          operations: ["chat"],
          input: chat?.input ?? [],
          output: chat?.output ?? [],
          reasoning: chat?.reasoning ?? false,
          toolCalling: chat?.toolCalling ?? false,
        },
        chat?.adapter === "native" && apiFormat !== "http-json",
      )
    : availableChatCapabilities(declared);
  return {
    declared,
    available,
    input: available.input.filter((value): value is "text" | "image" => value === "text" || value === "image"),
    source: configuration || model.capabilities != null ? ("custom" as const) : ("fallback" as const),
  };
};

export const getModelConnection = (
  provider: Pick<LlmProvider, "apiFormat" | "apiKey" | "apiEndpoint">,
  model: Pick<ProviderModel, "configuration">,
  purposeType: ModelConfiguration["purposes"][number]["type"] = "chat",
) =>
  resolveModelConnection(
    model.configuration?.purposes.find((purpose) => purpose.type === purposeType),
    {
      apiFormat: provider.apiFormat,
      apiKey: provider.apiKey ?? undefined,
      apiEndpoint: provider.apiEndpoint ?? "",
    },
  );

export const getModelMediaPurposes = (
  provider: Pick<LlmProvider, "provider" | "apiFormat" | "apiKey" | "apiEndpoint">,
  model: Pick<ProviderModel, "modelId" | "capabilities" | "configuration">,
): ModelMediaPurpose[] => {
  const configuration = model.configuration;
  if (
    !configuration ||
    !getModelCapabilities(provider, model).available.toolCalling ||
    getModelConfigurationError(configuration)
  )
    return [];
  // Match generate_media's configured catalog without widening conversation capabilities.
  const mediaPurposes: ModelMediaPurpose[] = [];
  for (const purpose of configuration.purposes) {
    if (
      (purpose.type === "image-generation" ||
        purpose.type === "image-editing" ||
        purpose.type === "video-generation" ||
        purpose.type === "speech") &&
      purpose.adapter === "http-json" &&
      purpose.request &&
      purpose.response &&
      purpose.output.some((type) => type === "image" || type === "video" || type === "audio") &&
      (getModelConnection(provider, model, purpose.type).apiEndpoint || /^https?:\/\//i.test(purpose.request.path))
    )
      mediaPurposes.push({ type: purpose.type, input: [...purpose.input], output: [...purpose.output] });
  }
  return mediaPurposes;
};

export const getModelLimits = (
  _provider: Pick<LlmProvider, "provider">,
  model: Pick<ProviderModel, "modelId" | "limits">,
) => {
  return {
    contextWindow: model.limits?.contextWindow ?? 128000,
    maxTokens: model.limits?.maxTokens ?? 16384,
  };
};

export const getModelLimitsError = (
  provider: Pick<LlmProvider, "provider">,
  model: Pick<ProviderModel, "modelId" | "limits">,
) => {
  const limits = getModelLimits(provider, model);
  if (
    [limits.contextWindow, limits.maxTokens].some(
      (value) => !Number.isInteger(value) || value < 1 || value > 2147483647,
    )
  )
    return "上下文和最大输出必须是有效的正整数";
  return limits.maxTokens > limits.contextWindow ? "最大输出不能超过上下文窗口（含默认值）" : "";
};

// Runtime helpers consume saved settings; editor-owned defaults are materialized before submission.
export const getModelThinking = (
  provider: Pick<LlmProvider, "provider" | "apiFormat">,
  model: Pick<ProviderModel, "modelId" | "thinking" | "capabilities" | "configuration">,
): RuntimeModelThinking | undefined => {
  if (!getModelCapabilities(provider, model).available.reasoning) return undefined;
  return model.thinking ? structuredClone(model.thinking) : undefined;
};

export const createRuntimeModelInput = (
  provider: Pick<LlmProvider, "provider" | "apiFormat" | "apiKey" | "apiEndpoint">,
  model: Pick<
    ProviderModel,
    "modelId" | "thinking" | "capabilities" | "limits" | "isOneMillionContext" | "configuration"
  >,
  modelId = formatProviderModelId(model),
): RuntimeModelInput => {
  const thinking = getModelThinking(provider, model);
  const capabilities = getModelCapabilities(provider, model);
  const connection = getModelConnection(provider, model);
  const chat = model.configuration?.purposes.find((purpose) => purpose.type === "chat");
  if (connection.apiFormat === "http-json") throw new Error("HTTP / JSON 用途需要专用执行服务");

  return {
    provider: provider.provider,
    apiFormat: connection.apiFormat,
    apiKey: connection.apiKey,
    catalogModelId: chat?.modelId?.trim() || model.modelId,
    modelId: chat?.modelId?.trim() ? withOneMillionContextSuffix(chat.modelId, model.isOneMillionContext) : modelId,
    apiEndpoint: connection.apiEndpoint ?? undefined,
    configuration: model.configuration
      ? structuredClone({
          ...model.configuration,
          purposes: model.configuration.purposes.map((purpose) => ({
            ...purpose,
            modelId: purpose.modelId?.trim() || model.modelId,
            connection: getModelConnection(provider, model, purpose.type),
          })),
        })
      : undefined,
    capabilities: model.configuration ? capabilities.available : capabilities.declared,
    input: capabilities.input,
    reasoning: model.configuration != null || model.capabilities != null ? capabilities.available.reasoning : undefined,
    ...(model.limits ?? {}),
    thinkingLevel: thinking?.defaultLevel ?? undefined,
  };
};

const buildRuntimeModelOption = (provider: LlmProvider, model: ProviderModel): RuntimeModelOption => {
  const modelId = formatProviderModelId(model);
  const modelName = formatProviderModelName(model);

  return {
    id: model.id,
    provider: {
      id: provider.id,
      name: provider.name,
    },
    modelId,
    modelName,
    thinking: getModelThinking(provider, model),
    capabilities: getModelCapabilities(provider, model).available,
    mediaPurposes: getModelMediaPurposes(provider, model),
  };
};

const buildRuntimeModelInput = (provider: LlmProvider, model: ProviderModel): RuntimeModelInput => {
  return createRuntimeModelInput(provider, model, formatProviderModelId(model));
};

export const buildRuntimeModelOptions = (settings: LlmSettings): RuntimeModelOption[] =>
  [...settings.providers]
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
    .flatMap((provider) =>
      provider.models
        .filter((model) => getModelCapabilities(provider, model).available.operations.includes("chat"))
        .map((model) => buildRuntimeModelOption(provider, model)),
    );

export const buildRuntimeModelInputs = (settings: LlmSettings): RuntimeModelInputMap => {
  const inputs: RuntimeModelInputMap = {};

  for (const provider of settings.providers) {
    for (const model of provider.models) {
      if (!getModelCapabilities(provider, model).available.operations.includes("chat")) continue;
      inputs[model.id] = buildRuntimeModelInput(provider, model);
    }
  }

  return inputs;
};
