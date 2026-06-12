import {
  completeSimple,
  streamSimple,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import {
  BridgeEventType,
  type ChatResult,
} from "../../contracts/protocol.js";
import type {
  ChatRuntime,
  ChatRuntimeContext,
  RuntimeChatCommand,
} from "../types.js";
import {
  createPiRuntimeModel,
  requirePiApiKey,
  requirePiRuntimeConfig,
} from "./model.js";
import {
  createPiChatContext,
  createPiChatResult,
} from "./messages.js";

export class PiChatRuntime implements ChatRuntime {
  readonly id = "pi-ai";

  async chat(command: RuntimeChatCommand, context: ChatRuntimeContext): Promise<ChatResult> {
    return command.stream === false
      ? this.complete(command)
      : this.stream(command, context);
  }

  private async complete(command: RuntimeChatCommand): Promise<ChatResult> {
    const runtimeModel = requirePiRuntimeConfig(command);
    const apiKey = requirePiApiKey(runtimeModel);
    const model = createPiRuntimeModel(runtimeModel);
    const message = await completeSimple(
      model,
      createPiChatContext(command, model),
      { apiKey },
    );

    return createPiChatResult(message);
  }

  private async stream(command: RuntimeChatCommand, context: ChatRuntimeContext): Promise<ChatResult> {
    const runtimeModel = requirePiRuntimeConfig(command);
    const apiKey = requirePiApiKey(runtimeModel);
    const model = createPiRuntimeModel(runtimeModel);
    const stream = streamSimple(
      model,
      createPiChatContext(command, model),
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

    return createPiChatResult(message);
  }
}
