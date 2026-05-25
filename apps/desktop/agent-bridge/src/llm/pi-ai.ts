import {
  completeSimple,
  getModel,
  type Api,
  type AssistantMessage,
  type Context,
  type Message,
  type Model,
  type Usage,
} from "@earendil-works/pi-ai";
import type { ChatCommand, ChatResult, ChatMessageInput, ModelInput, ProviderInput } from "../protocol.js";

const emptyUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
});

const apiForProvider = (provider: string): Api => {
  if (provider === "anthropic") {
    return "anthropic-messages";
  }

  if (provider === "google") {
    return "google-generative-ai";
  }

  return "openai-completions";
};

const createFallbackModel = (
  provider: ProviderInput,
  selectedModel: ModelInput,
): Model<Api> => ({
  id: selectedModel.modelId,
  name: selectedModel.modelName || selectedModel.modelId,
  api: apiForProvider(provider.provider),
  provider: provider.vendor,
  baseUrl: provider.baseUrl ?? selectedModel.baseUrl ?? "",
  reasoning: selectedModel.reasoning ?? false,
  thinkingLevelMap: selectedModel.thinkingLevelMap,
  input: selectedModel.input ?? ["text"],
  cost: selectedModel.cost ?? {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: selectedModel.contextWindow ?? 128000,
  maxTokens: selectedModel.maxTokens ?? 16384,
  headers: selectedModel.headers,
  compat: selectedModel.compat as Model<Api>["compat"],
});

const createRuntimeModel = (
  provider: ProviderInput,
  selectedModel: ModelInput,
): Model<Api> => {
  const catalogModel =
    (getModel as (provider: string, modelId: string) => Model<Api> | undefined)(
      provider.vendor,
      selectedModel.modelId,
    ) ??
    createFallbackModel(provider, selectedModel);

  return {
    ...catalogModel,
    api: apiForProvider(provider.provider),
    provider: provider.vendor,
    name: selectedModel.modelName || catalogModel.name,
    baseUrl: provider.baseUrl || selectedModel.baseUrl || catalogModel.baseUrl,
    reasoning: selectedModel.reasoning ?? catalogModel.reasoning,
    thinkingLevelMap: selectedModel.thinkingLevelMap ?? catalogModel.thinkingLevelMap,
    input: selectedModel.input ?? catalogModel.input,
    cost: selectedModel.cost ?? catalogModel.cost,
    contextWindow: selectedModel.contextWindow ?? catalogModel.contextWindow,
    maxTokens: selectedModel.maxTokens ?? catalogModel.maxTokens,
    headers: selectedModel.headers ?? catalogModel.headers,
    compat: (selectedModel.compat ?? catalogModel.compat) as Model<Api>["compat"],
  };
};

const textFromMessage = (message: AssistantMessage) => {
  const text = message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("")
    .trim();

  if (text) {
    return text;
  }

  const thinking = thinkingFromMessage(message);
  if (thinking) {
    return thinking;
  }

  const toolCalls = message.content
    .filter((content) => content.type === "toolCall")
    .map((content) => `${content.name}(${JSON.stringify(content.arguments)})`);

  if (toolCalls.length) {
    return `模型返回了工具调用：\n${toolCalls.join("\n")}`;
  }

  if (message.errorMessage) {
    return `模型返回错误：${message.errorMessage}`;
  }

  const diagnostic = message.diagnostics?.find((item) => item.error?.message);
  if (diagnostic?.error?.message) {
    return `模型请求失败：${diagnostic.error.message}`;
  }

  return `模型未返回可展示文本。stopReason=${message.stopReason}`;
};

const thinkingFromMessage = (message: AssistantMessage) => {
  const thinking = message.content
    .filter((content) => content.type === "thinking")
    .map((content) => content.thinking)
    .join("")
    .trim();

  return thinking || null;
};

const toPiMessage = (
  item: ChatMessageInput,
  model: Model<Api>,
): Message => {
  if (item.role === "assistant") {
    return {
      role: "assistant",
      content: [{ type: "text", text: item.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: emptyUsage(),
      stopReason: "stop",
      timestamp: Date.now(),
    };
  }

  return {
    role: "user",
    content: item.content,
    timestamp: Date.now(),
  };
};

const createContext = (
  command: ChatCommand,
  model: Model<Api>,
): Context => ({
  systemPrompt: command.systemPrompt,
  messages: command.messages.map((message) => toPiMessage(message, model)),
});

export const runPiAiChat = async (command: ChatCommand): Promise<ChatResult> => {
  const apiKey = command.provider.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`${command.provider.name} 未配置 API Key`);
  }

  const model = createRuntimeModel(command.provider, command.model);
  const message = await completeSimple(
    model,
    createContext(command, model),
    { apiKey },
  );

  return {
    type: "chat_result",
    text: textFromMessage(message),
    thinking: thinkingFromMessage(message),
  };
};
