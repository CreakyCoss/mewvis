import type {
  Api,
  AssistantMessage,
  Model,
  ProviderStreamOptions,
} from "@earendil-works/pi-ai";
import type { AIAdapter, ChatChunk, ChatOptions, ChatResult, ProviderConfig } from "./base";

const textFromMessage = (message: AssistantMessage) => {
  return message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("");
};

export class PiAIAdapter implements AIAdapter {
  readonly name = "pi-ai";
  readonly provider: string;

  constructor(
    private readonly config: ProviderConfig,
    readonly model: Model<Api>,
  ) {
    this.provider = config.provider;
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const { completeSimple } = await import("@earendil-works/pi-ai");
    const message = await completeSimple(
      this.model,
      options.context,
      this.mergeOptions(options.streamOptions),
    );

    return {
      message,
      text: textFromMessage(message),
    };
  }

  streamChat(options: ChatOptions, onChunk: (chunk: ChatChunk) => void) {
    const controller = new AbortController();

    void this.consumeStream(options, onChunk, controller.signal);

    return () => controller.abort();
  }

  private async consumeStream(
    options: ChatOptions,
    onChunk: (chunk: ChatChunk) => void,
    signal: AbortSignal,
  ) {
    const { streamSimple } = await import("@earendil-works/pi-ai");
    const stream = streamSimple(
      this.model,
      options.context,
      this.mergeOptions(options.streamOptions, signal),
    );

    for await (const chunk of stream) {
      onChunk(chunk);
    }
  }

  private mergeOptions(
    options: ProviderStreamOptions | undefined,
    signal?: AbortSignal,
  ): ProviderStreamOptions {
    return {
      ...options,
      apiKey: this.config.apiKey || options?.apiKey,
      signal: signal ?? options?.signal,
    };
  }
}
