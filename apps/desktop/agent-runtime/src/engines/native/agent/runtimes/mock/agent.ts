import { AgentEventType } from "../../contracts/events.js";
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

    emit({ type: AgentEventType.Started, taskId: command.taskId });
    emit({
      type: AgentEventType.ThinkingDelta,
      taskId: command.taskId,
      delta: "Mock agent 正在生成模拟结果...\n",
    });
    await sleep(30);
    emit({
      type: AgentEventType.ToolStart,
      taskId: command.taskId,
      toolName: "mock_tool",
      args: { promptLength: command.agentTaskPrompt.length },
    });
    await sleep(30);
    emit({
      type: AgentEventType.ToolUpdate,
      taskId: command.taskId,
      toolName: "mock_tool",
      partialResult: "模拟工具执行中",
    });
    await sleep(30);
    emit({
      type: AgentEventType.ToolEnd,
      taskId: command.taskId,
      toolName: "mock_tool",
      isError: false,
      result: "模拟工具执行完成",
    });

    for (const delta of chunkText(text)) {
      emit({ type: AgentEventType.TextDelta, taskId: command.taskId, delta });
      await sleep(10);
    }

    emit({ type: AgentEventType.ThinkingEnd, taskId: command.taskId, content: "模拟完成。" });
    emit({ type: AgentEventType.Done, taskId: command.taskId, text });

    return { text };
  }

  async compact(command: RuntimeAgentCompactCommand): Promise<AgentCompactResult> {
    return {
      compacted: false,
      message: `mock agent session ${command.agentRoleId ?? "default"} 不需要压缩`,
    };
  }
}
