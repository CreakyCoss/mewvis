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

export class TauriBridgeLlmRuntimeAdapter implements LlmRuntimeAdapter {
  readonly id = "system";
  readonly name = "System LLM";
  readonly provider: string;
  readonly model: LlmProviderConfig["model"];

  constructor(private readonly config: LlmProviderConfig) {
    this.provider = config.provider;
    this.model = config.model;
  }

  async chat(options: LlmChatOptions): Promise<LlmChatResult> {
    const output = await invoke<ChatWithLlmOutput>("chat_with_llm", {
      input: {
        runtime: "system",
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
