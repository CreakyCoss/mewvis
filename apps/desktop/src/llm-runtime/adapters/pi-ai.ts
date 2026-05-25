import { invoke } from "@tauri-apps/api/core";
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
    const output = await invoke<ChatWithLlmOutput>("chat_with_llm", {
      input: {
        runtime: "pi-ai",
        provider: this.config,
        model: this.config.model,
        systemPrompt: options.systemPrompt,
        messages: options.messages,
      },
    });

    return {
      ...output,
      message: output,
    };
  }
}
