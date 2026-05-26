import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  LlmChatOptions,
  LlmChatResult,
  LlmProviderConfig,
  LlmRuntimeAdapter,
} from "../base";

type ChatWithLlmOutput = {
  text: string;
  thinking?: string | null;
};

type LlmChatEvent =
  | { type: "text_delta"; streamId: string; delta: string }
  | { type: "thinking_delta"; streamId: string; delta: string };

export class PiAiLlmRuntimeAdapter implements LlmRuntimeAdapter {
  readonly id = "pi-ai";
  readonly name = "pi-ai";
  readonly provider: string;
  readonly model: LlmProviderConfig["model"];

  private constructor(private readonly config: LlmProviderConfig) {
    this.provider = config.provider;
    this.model = config.model;
  }

  static async create(config: LlmProviderConfig) {
    return new PiAiLlmRuntimeAdapter(config);
  }

  async chat(options: LlmChatOptions): Promise<LlmChatResult> {
    const shouldStream = options.stream ?? true;
    const streamId = shouldStream && (options.onTextDelta || options.onThinkingDelta)
      ? crypto.randomUUID()
      : undefined;
    const unlisten = streamId
      ? await listen<LlmChatEvent>("llm_chat_event", (event) => {
        if (event.payload.streamId !== streamId) {
          return;
        }
        if (event.payload.type === "text_delta") {
          options.onTextDelta?.(event.payload.delta);
        }
        if (event.payload.type === "thinking_delta") {
          options.onThinkingDelta?.(event.payload.delta);
        }
      })
      : undefined;

    const output = await invoke<ChatWithLlmOutput>("chat_with_llm", {
      input: {
        runtime: "pi-ai",
        streamId,
        stream: shouldStream,
        provider: this.config,
        model: this.config.model,
        systemPrompt: options.systemPrompt,
        messages: options.messages,
      },
    }).finally(() => {
      unlisten?.();
    });

    return {
      ...output,
      message: output,
    };
  }
}
