import { InMemoryCredentialStore, type Api, type Model, type ThinkingLevel } from "@earendil-works/pi-ai";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { RuntimeApiFormat, RuntimeModelInput } from "../../../../../../protocol/wire.js";
import type { ChatRunCommand, RuntimeAgentCommand } from "../../types.js";

export const requirePiApiKey = (runtimeModel: RuntimeModelInput) => {
  const apiKey = runtimeModel.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`${runtimeModel.provider} 未配置 API Key`);
  }

  return apiKey;
};

export const requirePiRuntimeConfig = (
  command: Pick<RuntimeAgentCommand | ChatRunCommand, "runtimeModel">,
): RuntimeModelInput => {
  if (!command.runtimeModel) {
    throw new Error("Pi runtime 需要配置 LLM provider 和模型");
  }

  return command.runtimeModel;
};

const piApiForFormat = (apiFormat: RuntimeApiFormat): Api => {
  switch (apiFormat) {
    case "anthropic-messages":
      return "anthropic-messages";
    case "google-generative-ai":
      return "google-generative-ai";
    case "openai-responses":
      return "openai-responses";
    case "azure-openai-responses":
      return "azure-openai-responses";
    case "openai-codex-responses":
      return "openai-codex-responses";
    case "openai-completions":
    case "openrouter":
      return "openai-completions";
  }
};

const readCatalogPiModel = (runtimeModel: RuntimeModelInput): Model<Api> | undefined =>
  (getBuiltinModel as (provider: string, modelId: string) => Model<Api> | undefined)(
    runtimeModel.provider,
    runtimeModel.catalogModelId,
  );

const PI_THINKING_LEVELS: readonly string[] = ["minimal", "low", "medium", "high", "xhigh", "max"];

// Pi needs a fixed SDK level. Its native-value map carries custom effort strings unchanged.
const toPiThinkingLevel = (level?: string | null): ThinkingLevel | "off" =>
  !level || level === "off" ? "off" : PI_THINKING_LEVELS.includes(level) ? (level as ThinkingLevel) : "high";

export const createPiRuntimeModel = (runtimeModel: RuntimeModelInput): Model<Api> => {
  const catalogModel = readCatalogPiModel(runtimeModel);
  const thinkingLevel = toPiThinkingLevel(runtimeModel.thinkingLevel);
  const api = piApiForFormat(runtimeModel.apiFormat);
  const sameApi = catalogModel?.api === api;

  return {
    id: runtimeModel.modelId,
    name: runtimeModel.modelId,
    api,
    provider: runtimeModel.provider,
    baseUrl: runtimeModel.apiEndpoint ?? catalogModel?.baseUrl ?? "",
    reasoning: thinkingLevel !== "off" ? true : (runtimeModel.reasoning ?? catalogModel?.reasoning ?? true),
    thinkingLevelMap: {
      ...(sameApi ? catalogModel?.thinkingLevelMap : undefined),
      off: runtimeModel.thinkingLevel === "off" ? (catalogModel?.thinkingLevelMap?.off ?? undefined) : null,
      ...(thinkingLevel !== "off" ? { [thinkingLevel]: runtimeModel.thinkingLevel } : {}),
    },
    input: runtimeModel.input ?? catalogModel?.input ?? ["text"],
    cost: runtimeModel.cost ??
      catalogModel?.cost ?? {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    contextWindow: runtimeModel.contextWindow ?? catalogModel?.contextWindow ?? 128000,
    maxTokens: runtimeModel.maxTokens ?? catalogModel?.maxTokens ?? 16384,
    headers: runtimeModel.headers ?? catalogModel?.headers,
    compat: sameApi ? catalogModel?.compat : undefined,
    samplingParams: sameApi ? catalogModel?.samplingParams : undefined,
  };
};

export const createPiModelRuntime = async (runtimeModel: RuntimeModelInput, signal?: AbortSignal) => {
  const thinkingLevel = toPiThinkingLevel(runtimeModel.thinkingLevel);
  const apiKey = requirePiApiKey(runtimeModel);
  const model = createPiRuntimeModel(runtimeModel);
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    signal,
  });
  modelRuntime.registerProvider(model.provider, {
    api: model.api,
    baseUrl: model.baseUrl,
    models: [model],
  });
  await modelRuntime.setRuntimeApiKey(model.provider, apiKey, { signal });
  return { model, modelRuntime, thinkingLevel };
};
