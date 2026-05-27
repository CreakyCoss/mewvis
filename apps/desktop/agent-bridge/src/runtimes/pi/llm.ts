import {
  completeSimple,
  streamSimple,
  type Api,
  type AssistantMessage,
  type Context,
  type Message,
  type Model,
  type Usage,
} from "@earendil-works/pi-ai";
import {
  BridgeEventType,
  BridgeResultType,
  type ChatCommand,
  type ChatMessageInput,
  type ChatResult,
} from "../../contracts/protocol.js";
import type { BaseLLM, LlmRuntimeContext } from "../../contracts/runtime.js";
import { createPiRuntimeModel, requirePiApiKey, type PiModelSource } from "./model.js";

const PI_LLM_MODEL_SOURCE = "input" satisfies PiModelSource;

export class PiLLM implements BaseLLM {
  readonly id = "pi-ai";

  async chat(command: ChatCommand, context: LlmRuntimeContext): Promise<ChatResult> {
    return command.stream === false
      ? this.complete(command)
      : this.stream(command, context);
  }

  private async complete(command: ChatCommand): Promise<ChatResult> {
    const apiKey = requirePiApiKey(command.provider);
    const model = createPiRuntimeModel(command.provider, command.model, {
      modelSource: PI_LLM_MODEL_SOURCE,
    });
    const message = await completeSimple(
      model,
      this.createContext(command, model),
      { apiKey },
    );

    return this.createChatResult(message);
  }

  private async stream(command: ChatCommand, context: LlmRuntimeContext): Promise<ChatResult> {
    const apiKey = requirePiApiKey(command.provider);
    const model = createPiRuntimeModel(command.provider, command.model, {
      modelSource: PI_LLM_MODEL_SOURCE,
    });
    const stream = streamSimple(
      model,
      this.createContext(command, model),
      { apiKey },
    );
    let message: AssistantMessage | null = null;

    for await (const event of stream) {
      if (event.type === "text_delta" && command.streamId) {
        context.emit({
          type: BridgeEventType.TextDelta,
          taskId: command.streamId,
          delta: event.delta,
        });
      }
      if (event.type === "thinking_delta" && command.streamId) {
        context.emit({
          type: BridgeEventType.ThinkingDelta,
          taskId: command.streamId,
          delta: event.delta,
        });
      }
      if (event.type === "done") {
        message = event.message;
      }
      if (event.type === "error") {
        message = event.error;
      }
    }

    message ??= await stream.result();

    return this.createChatResult(message);
  }

  private createChatResult(message: AssistantMessage): ChatResult {
    return {
      type: BridgeResultType.ChatResult,
      text: this.textFromMessage(message),
      thinking: this.thinkingFromMessage(message),
    };
  }

  private createContext(command: ChatCommand, model: Model<Api>): Context {
    return {
      systemPrompt: command.systemPrompt,
      messages: command.messages.map((message) => this.toPiMessage(message, model)),
    };
  }

  private toPiMessage(
    item: ChatMessageInput,
    model: Model<Api>,
  ): Message {
    if (item.role === "assistant") {
      return {
        role: "assistant",
        content: [{ type: "text", text: item.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: this.emptyUsage(),
        stopReason: "stop",
        timestamp: Date.now(),
      };
    }

    return {
      role: "user",
      content: item.content,
      timestamp: Date.now(),
    };
  }

  private emptyUsage(): Usage {
    return {
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
    };
  }

  private textFromMessage(message: AssistantMessage) {
    const text = message.content
      .filter((content) => content.type === "text")
      .map((content) => content.text)
      .join("")
      .trim();

    if (text) {
      return text;
    }

    const thinking = this.thinkingFromMessage(message);
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
  }

  private thinkingFromMessage(message: AssistantMessage) {
    const thinking = message.content
      .filter((content) => content.type === "thinking")
      .map((content) => content.thinking)
      .join("")
      .trim();

    return thinking || null;
  }
}
