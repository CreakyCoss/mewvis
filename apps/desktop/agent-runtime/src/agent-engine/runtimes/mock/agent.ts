import { BridgeEventType } from "../../contracts/protocol.js";
import type {
  AgentCompactResult,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
  RuntimeAgentCommand,
} from "../types.js";
import { chunkText, createMockAgentText, sleep } from "./response.js";

export class MockAgent implements AgentRuntime {
  readonly id = "mock";

  async run(command: RuntimeAgentCommand, { emit }: AgentRuntimeContext): Promise<AgentRunResult> {
    const text = createMockAgentText(command);

    emit({ type: BridgeEventType.Started, taskId: command.taskId });
    emit({
      type: BridgeEventType.ThinkingDelta,
      taskId: command.taskId,
      delta: "Mock agent 正在生成模拟结果...\n",
    });
    await sleep(30);
    emit({
      type: BridgeEventType.ToolStart,
      taskId: command.taskId,
      toolName: "mock_tool",
      args: { promptLength: command.agentTaskPrompt.length },
    });
    await sleep(30);
    emit({
      type: BridgeEventType.ToolUpdate,
      taskId: command.taskId,
      toolName: "mock_tool",
      partialResult: "模拟工具执行中",
    });
    await sleep(30);
    emit({
      type: BridgeEventType.ToolEnd,
      taskId: command.taskId,
      toolName: "mock_tool",
      isError: false,
      result: "模拟工具执行完成",
    });

    for (const delta of chunkText(text)) {
      emit({ type: BridgeEventType.TextDelta, taskId: command.taskId, delta });
      await sleep(10);
    }

    emit({ type: BridgeEventType.ThinkingEnd, taskId: command.taskId, content: "模拟完成。" });
    emit({ type: BridgeEventType.Done, taskId: command.taskId, text });

    return { text };
  }

  async compact(command: RuntimeAgentCompactCommand): Promise<AgentCompactResult> {
    return {
      compacted: false,
      message: `mock agent session ${command.agentRoleId ?? "default"} 不需要压缩`,
    };
  }
}
