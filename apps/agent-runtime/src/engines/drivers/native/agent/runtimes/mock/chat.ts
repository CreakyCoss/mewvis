import { AgentRuntimeEventType } from "../../../../../protocol/wire.js";
import type { ChatRunResult, ChatRuntime, ChatRuntimeContext, ChatRunCommand } from "../types.js";
import { chunkText, createMockChatText, sleep } from "./response.js";

export class MockChatRuntime implements ChatRuntime {
  readonly id = "mock";

  async chat(command: ChatRunCommand, context: ChatRuntimeContext): Promise<ChatRunResult> {
    const text = createMockChatText(command);
    const thinking = "Mock chat runtime 跳过真实模型调用，直接生成固定格式回复。";

    if (command.stream !== false && command.streamId) {
      context.emit({
        type: AgentRuntimeEventType.ThinkingDelta,
        taskId: command.streamId,
        delta: `${thinking}\n`,
      });

      for (const delta of chunkText(text)) {
        context.emit({ type: AgentRuntimeEventType.TextDelta, taskId: command.streamId, delta });
        await sleep(10);
      }
    }

    return {
      text,
      thinking,
    };
  }
}
