import { toAgentRuntimeProviderConfig } from "@/ai/agent-runtime/config";
import type {
  AgentRuntimeAgentEvent,
  AgentRuntimeModelConfig,
  AgentToolName,
} from "@/ai/agent-runtime/contracts";
import type { AgentRuntime } from "@/ai/agent-runtime/runtime";
import type { LlmProvider } from "@/ai/llm/types";

export type SharedAgentTaskResult = {
  taskId: string;
  text: string;
  thinking?: string;
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
  provider: LlmProvider;
  model: AgentRuntimeModelConfig;
  allowedTools: AgentToolName[];
  enabledSkillNames: string[];
  chatSessionId?: string | null;
  bootstrapContext?: string | null;
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
  provider,
  model,
  allowedTools,
  enabledSkillNames,
  chatSessionId = null,
  bootstrapContext = null,
  abortOnQuestion = true,
  onEvent,
  onTaskCreated,
  errorMessageForEvent = sharedAgentTaskErrorMessage,
}: RunSharedAgentTaskInput): Promise<SharedAgentTaskResult> => {
  let taskId = "";
  let latestText = "";
  let latestThinking = "";
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

    if (event.type === "text_delta") {
      latestText += event.delta;
      return;
    }
    if (event.type === "replace_text") {
      latestText = event.text;
      return;
    }
    if (event.type === "thinking_delta") {
      latestThinking += event.delta;
      return;
    }
    if (event.type === "thinking_end") {
      latestThinking = event.content || latestThinking;
      return;
    }
    if (event.type === "done") {
      latestText = event.text || latestText;
      resolveTask({
        taskId,
        text: latestText.trim(),
        thinking: latestThinking.trim() || undefined,
      });
      return;
    }
    if (event.type === "exit" && event.success) {
      resolveTask({
        taskId,
        text: latestText.trim(),
        thinking: latestThinking.trim() || undefined,
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
      chatSessionId,
      bootstrapContext,
      prompt,
      provider: toAgentRuntimeProviderConfig(provider),
      model,
      allowedTools,
      enabledSkills: enabledSkillNames,
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
