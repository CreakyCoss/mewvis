import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Model,
  ProviderStreamOptions,
} from "@earendil-works/pi-ai";

export type AdapterModelConfig = {
  id: string;
  modelId: string;
  modelName: string;
};

export type ProviderConfig = {
  id: string;
  name: string;
  vendor: string;
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  model: AdapterModelConfig;
};

export type ChatOptions = {
  context: Context;
  streamOptions?: ProviderStreamOptions;
};

export type ChatResult = {
  message: AssistantMessage;
  text: string;
};

export type ChatChunk = AssistantMessageEvent;

export interface AIAdapter {
  readonly name: string;
  readonly provider: string;
  readonly model: Model<Api>;
  chat(options: ChatOptions): Promise<ChatResult>;
  streamChat(options: ChatOptions, onChunk: (chunk: ChatChunk) => void): () => void;
}
