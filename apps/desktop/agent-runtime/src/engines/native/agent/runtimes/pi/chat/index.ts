import {
  completeSimple,
  streamSimple,
  type AssistantMessage,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { AgentEventType } from "../../../../../protocol/index.js";
import type {
  ChatRunResult,
  ChatRuntime,
  ChatRuntimeContext,
  ChatRunCommand,
} from "../../types.js";
import {
  createPiRuntimeModel,
  requirePiApiKey,
  requirePiRuntimeConfig,
  resolvePiRuntimeThinkingLevel,
} from "../model/index.js";
import {
  createPiChatContext,
  createPiChatResult,
} from "./messages.js";

export class PiChatRuntime implements ChatRuntime {
  readonly id = "pi-ai";

  async chat(command: ChatRunCommand, context: ChatRuntimeContext): Promise<ChatRunResult> {
    return command.stream === false
      ? this.complete(command, context)
      : this.stream(command, context);
  }

  private async complete(command: ChatRunCommand, context: ChatRuntimeContext): Promise<ChatRunResult> {
    const request = this.createRequest(command, context);
    const message = await completeSimple(
      request.model,
      request.chatContext,
      request.options,
    );

    return createPiChatResult(message);
  }

  private async stream(command: ChatRunCommand, context: ChatRuntimeContext): Promise<ChatRunResult> {
    const request = this.createRequest(command, context);
    const stream = streamSimple(
      request.model,
      request.chatContext,
      request.options,
    );
    let message: AssistantMessage | null = null;

    for await (const event of stream) {
      if (event.type === "text_delta" && command.streamId) {
        context.emit({
          type: AgentEventType.TextDelta,
          taskId: command.streamId,
          delta: event.delta,
        });
      }
      if (event.type === "thinking_delta" && command.streamId) {
        context.emit({
          type: AgentEventType.ThinkingDelta,
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

    return createPiChatResult(message);
  }

  private createRequest(command: ChatRunCommand, context: ChatRuntimeContext) {
    const runtimeModel = requirePiRuntimeConfig(command);
    const apiKey = requirePiApiKey(runtimeModel);
    const model = createPiRuntimeModel(runtimeModel);
    const thinkingLevel = resolvePiRuntimeThinkingLevel(runtimeModel);
    const options: SimpleStreamOptions = {
      apiKey,
      signal: context.signal,
      maxRetries: context.maxRetries,
    };

    if (thinkingLevel && thinkingLevel !== "off") {
      options.reasoning = thinkingLevel;
    }

    return {
      model,
      chatContext: createPiChatContext(command, model),
      options,
    };
  }
}
