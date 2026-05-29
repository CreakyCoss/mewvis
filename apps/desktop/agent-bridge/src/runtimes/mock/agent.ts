import {
  BridgeEventType,
  type AgentRunResult,
  type StartTaskCommand,
} from "../../contracts/protocol.js";
import type { AgentRuntime, AgentRuntimeContext } from "../../contracts/runtime.js";
import { chunkText, createMockAgentText, sleep } from "./response.js";

export class MockAgent implements AgentRuntime {
  readonly id = "mock";

  async run(command: StartTaskCommand, { emit }: AgentRuntimeContext): Promise<AgentRunResult> {
    const text = createMockAgentText(command);

    emit({ type: BridgeEventType.Started, taskId: command.taskId });
    emit({
      type: BridgeEventType.ThinkingDelta,
      taskId: command.taskId,
      delta: "Mock agent 正在生成模拟结果...\n",
    });
    await sleep(30);

    for (const delta of chunkText(text)) {
      emit({ type: BridgeEventType.TextDelta, taskId: command.taskId, delta });
      await sleep(10);
    }

    emit({ type: BridgeEventType.ThinkingEnd, taskId: command.taskId, content: "模拟完成。" });
    emit({ type: BridgeEventType.Done, taskId: command.taskId, text });

    return { text };
  }
}
