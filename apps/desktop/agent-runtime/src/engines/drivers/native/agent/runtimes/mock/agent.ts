import { AgentEventType, AgentResultType, type SessionMutationResult } from "../../../../../protocol/index.js";
import { resolveBuiltinCombinations } from "../../../../../builtins/resolve.js";
import type {
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
  RuntimeAgentCommand,
  RuntimeAgentRebuildCommand,
  RuntimeAgentSummarizeCommand,
} from "../types.js";
import { chunkText, createMockAgentText, sleep } from "./response.js";
import { runtimeResourcesFor } from "../resources.js";

export class MockAgent implements AgentRuntime {
  readonly id = "mock";

  async run(command: RuntimeAgentCommand, { emit }: AgentRuntimeContext): Promise<AgentRunResult> {
    const privateTools = resolveBuiltinCombinations(runtimeResourcesFor(command).skills?.enabled ?? []).requiredTools
      .internal;
    if (privateTools.length > 0) {
      throw new Error(`Mock agent 不支持内置私有工具：${privateTools.map((tool) => tool.name).join(", ")}`);
    }
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

  async compact(command: RuntimeAgentCompactCommand): Promise<SessionMutationResult> {
    return mockAgentMaintenanceResult(command, {
      compacted: false,
    });
  }

  async rebuild(command: RuntimeAgentRebuildCommand): Promise<SessionMutationResult> {
    return mockAgentMaintenanceResult(command, {
      rebuilt: false,
    });
  }

  async summarize(
    command: RuntimeAgentSummarizeCommand,
    { nativeSession }: AgentRuntimeContext,
  ): Promise<SessionMutationResult> {
    if (!nativeSession) {
      throw new Error("mock agent session 摘要需要 native session 上下文");
    }

    const session = await nativeSession.readSession();
    const generatedAt = Date.now();
    return {
      ...session,
      type: AgentResultType.SessionMutationResult,
      displaySummary: {
        recordId: `agent-summary-${generatedAt}`,
        targetLeafId: command.agentSessionId ?? command.agentRoleId,
        summary: `mock agent session ${command.agentRoleId ?? "default"} 没有可摘要内容`,
        timestamp: generatedAt,
        generatedAt,
        summaryInstruction: command.summaryInstruction ?? null,
        runtimeId: command.runtimeId ?? null,
        modelId: command.runtimeModel?.modelId ?? null,
        sourceCharCount: 0,
        chunkCount: null,
        llmCallCount: null,
        messageCount: 0,
        entryCount: null,
      },
    };
  }
}

const mockAgentMaintenanceResult = (
  command: RuntimeAgentCompactCommand | RuntimeAgentRebuildCommand,
  result: Pick<SessionMutationResult, "compacted" | "rebuilt">,
): SessionMutationResult => ({
  type: AgentResultType.SessionMutationResult,
  requestId: command.requestId ?? null,
  sessionRootDir: command.sessionRootDir,
  summary: "",
  messages: [],
  ...result,
});
