import type { AssistantMessage, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { AgentRuntimeEventType } from "../../../../../../protocol/wire.js";
import type { ChatRunResult, ChatRuntime, ChatRuntimeContext, ChatRunCommand } from "../../types.js";
import { createPiModelRuntime, requirePiRuntimeConfig } from "../model/index.js";
import { createPiChatContext, createPiChatResult } from "./messages.js";

export class PiChatRuntime implements ChatRuntime {
  readonly id = "pi-ai";

  async chat(command: ChatRunCommand, context: ChatRuntimeContext): Promise<ChatRunResult> {
    return command.stream === false ? this.complete(command, context) : this.stream(command, context);
  }

  private async complete(command: ChatRunCommand, context: ChatRuntimeContext): Promise<ChatRunResult> {
    const request = await this.createRequest(command, context);
    const message = await request.modelRuntime.completeSimple(request.model, request.chatContext, request.options);

    return createPiChatResult(message);
  }

  private async stream(command: ChatRunCommand, context: ChatRuntimeContext): Promise<ChatRunResult> {
    const request = await this.createRequest(command, context);
    const stream = request.modelRuntime.streamSimple(request.model, request.chatContext, request.options);
    let message: AssistantMessage | null = null;

    for await (const event of stream) {
      if (event.type === "text_delta" && command.streamId) {
        context.emit({
          type: AgentRuntimeEventType.TextDelta,
          taskId: command.streamId,
          delta: event.delta,
        });
      }
      if (event.type === "thinking_delta" && command.streamId) {
        context.emit({
          type: AgentRuntimeEventType.ThinkingDelta,
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

  private async createRequest(command: ChatRunCommand, context: ChatRuntimeContext) {
    const runtimeModel = requirePiRuntimeConfig(command);
    const { model, modelRuntime, thinkingLevel } = await createPiModelRuntime(runtimeModel, context.signal);
    const options: SimpleStreamOptions = {
      signal: context.signal,
      maxRetries: context.maxRetries,
    };

    if (thinkingLevel && thinkingLevel !== "off") {
      options.reasoning = thinkingLevel;
    }

    return {
      model,
      modelRuntime,
      chatContext: createPiChatContext(command, model),
      options,
    };
  }
}
