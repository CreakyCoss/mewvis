import type {
  RuntimeModelInput,
  RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import type { AgentRuntimeAgentEvent } from "@/ai/agent-runtime/contracts";
import {
  applyAgentRuntimeOutputEvent,
  createAgentRuntimeOutputState,
  isAgentRuntimeOutputEvent,
  snapshotAgentRuntimeOutput,
} from "@/ai/agent-runtime/output";
import type { AgentRuntime } from "@/ai/agent-runtime/runtime";

export type SharedAgentTaskResult = {
  taskId: string;
  text: string;
  thinking?: string;
  bridgeSession?: {
    sessionRootDir: string;
    userMessageRecordId?: string | null;
    requestContextRecordId?: string | null;
    runtimeInstructionRecordId?: string | null;
    assistantMessageRecordId?: string | null;
  } | null;
};

export type SharedAgentTaskCreated = {
  taskId: string;
  startedAt: number;
  endedAt: number;
};

export type RunSharedAgentTaskInput = {
  agentRuntime: AgentRuntime;
  runtimeAgentId: string;
  workspacePath: string;
  prompt: string;
  runtimeModel: RuntimeModelInput;
  allowedTools: RuntimeAgentToolName[];
  activeSkillNames: string[];
  sessionRootDir?: string | null;
  agentRoleId?: string | null;
  userMessage?: string | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  abortOnQuestion?: boolean;
  onEvent?: (event: AgentRuntimeAgentEvent) => void;
  onTaskCreated?: (task: SharedAgentTaskCreated) => void;
  errorMessageForEvent?: (event: AgentRuntimeAgentEvent) => string;
};

export const sharedAgentTaskErrorMessage = (event: AgentRuntimeAgentEvent) => {
  if (event.type === "error") {
    return event.message;
  }
  if (event.type === "exit" && !event.success) {
    return `Agent 异常退出，退出码: ${event.code ?? "unknown"}`;
  }
  if (event.type === "question") {
    return `Agent 请求用户输入：${event.question}`;
  }
  return "Agent 任务失败";
};

export const runSharedAgentTask = async ({
  agentRuntime,
  runtimeAgentId,
  workspacePath,
  prompt,
  runtimeModel,
  allowedTools,
  activeSkillNames,
  sessionRootDir = null,
  agentRoleId = null,
  userMessage = null,
  systemPrompt = null,
  requestContext = null,
  runtimeInstruction = null,
  bootstrapInstruction = null,
  abortOnQuestion = true,
  onEvent,
  onTaskCreated,
  errorMessageForEvent = sharedAgentTaskErrorMessage,
}: RunSharedAgentTaskInput): Promise<SharedAgentTaskResult> => {
  let taskId = "";
  const output = createAgentRuntimeOutputState();
  let bridgeSession: SharedAgentTaskResult["bridgeSession"] = null;
  let isSettled = false;
  let resolveTask!: (result: SharedAgentTaskResult) => void;
  let rejectTask!: (error: Error) => void;

  const completion = new Promise<SharedAgentTaskResult>((resolve, reject) => {
    resolveTask = (result) => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      resolve(result);
    };
    rejectTask = (error) => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      reject(error);
    };
  });

  const unlisten = await agentRuntime.subscribe((event) => {
    if (!taskId || event.taskId !== taskId) {
      return;
    }

    onEvent?.(event);

    if (isAgentRuntimeOutputEvent(event)) {
      applyAgentRuntimeOutputEvent(output, event);
      if (event.type === "done") {
        bridgeSession = event.bridgeSession ?? null;
      }
      if (event.type !== "done") {
        return;
      }
      const result = snapshotAgentRuntimeOutput(output);
      resolveTask({
        taskId,
        ...result,
        bridgeSession,
      });
      return;
    }

    if (event.type === "exit" && event.success) {
      const result = snapshotAgentRuntimeOutput(output);
      resolveTask({
        taskId,
        ...result,
        bridgeSession,
      });
      return;
    }
    if (
      event.type === "error" ||
      event.type === "question" ||
      (event.type === "exit" && !event.success)
    ) {
      if (event.type === "question" && abortOnQuestion) {
        void agentRuntime.abortTask(taskId).catch(() => undefined);
      }
      rejectTask(new Error(errorMessageForEvent(event)));
    }
  });

  try {
    const startedAt = Date.now();
    const task = await agentRuntime.run({
      type: "agent",
      agentId: runtimeAgentId,
      workspacePath,
      sessionRootDir,
      agentRoleId,
      userMessage: userMessage ?? prompt,
      systemPrompt,
      requestContext,
      runtimeInstruction,
      bootstrapInstruction,
      runtimeModel,
      allowedTools,
      enabledSkills: activeSkillNames,
    });
    taskId = task.taskId;
    onTaskCreated?.({
      taskId,
      startedAt,
      endedAt: Date.now(),
    });
    return await completion;
  } finally {
    unlisten();
  }
};
