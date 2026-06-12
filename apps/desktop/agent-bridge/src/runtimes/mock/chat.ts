import {
  BridgeEventType,
  BridgeResultType,
  type ChatResult,
} from "../../contracts/protocol.js";
import type {
  ChatRuntime,
  ChatRuntimeContext,
  RuntimeChatCommand,
} from "../types.js";
import { chunkText, createMockChatText, sleep } from "./response.js";

export class MockChatRuntime implements ChatRuntime {
  readonly id = "mock";

  async chat(command: RuntimeChatCommand, context: ChatRuntimeContext): Promise<ChatResult> {
    const text = createMockChatText(command);
    const thinking = "Mock chat runtime 跳过真实模型调用，直接生成固定格式回复。";

    if (command.stream !== false && command.streamId) {
      context.emit({
        type: BridgeEventType.ThinkingDelta,
        taskId: command.streamId,
        delta: `${thinking}\n`,
      });

      for (const delta of chunkText(text)) {
        context.emit({ type: BridgeEventType.TextDelta, taskId: command.streamId, delta });
        await sleep(10);
      }
    }

    return {
      type: BridgeResultType.ChatResult,
      text,
      thinking,
    };
  }
}
