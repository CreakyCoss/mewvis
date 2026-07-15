import type { AgentClientAgentEvent } from "@/agent-client/types";
import type { ChatMessage } from "../types";

type AgentTaskStateEvent = Extract<AgentClientAgentEvent, { type: "state" }>;

export type TerminalAgentTask = {
  status: "done" | "error";
  message: string;
};

const failedTaskStates = new Set(["failed", "error"]);
const failedWorkerStates = new Set(["failed", "error", "crashed", "unhealthy"]);

export const terminalAgentTaskFromEvent = (
  event: AgentTaskStateEvent,
  lastError = "",
  lastStderr = "",
): TerminalAgentTask | null => {
  const taskState = event.taskState.toLowerCase();
  const workerState = event.workerState.toLowerCase();

  if (taskState === "done") {
    return { status: "done", message: "Agent 任务已完成。" };
  }
  if (taskState === "cancelled" || taskState === "canceled") {
    return {
      status: "error",
      message: lastError.trim() || lastStderr.trim() || "Agent 任务已取消",
    };
  }
  if (failedTaskStates.has(taskState) || failedWorkerStates.has(workerState)) {
    return {
      status: "error",
      message: lastError.trim() || lastStderr.trim() || `Agent 任务失败：${event.taskState}/${event.workerState}`,
    };
  }

  return null;
};

export const settleAgentMessage = (message: ChatMessage, terminal: TerminalAgentTask): ChatMessage => ({
  ...message,
  text: terminal.status === "error" ? terminal.message : message.text.trim() || terminal.message,
  status: terminal.status,
});

export const settleOrphanedAgentMessages = (messages: ChatMessage[]): ChatMessage[] => {
  let changed = false;
  const settled = messages.map<ChatMessage>((message) => {
    const isOrphaned =
      message.role === "assistant" &&
      message.mode === "agent" &&
      (message.status === "loading" || message.status === "streaming");
    if (!isOrphaned) {
      return message;
    }

    changed = true;
    return {
      ...message,
      text: message.text.trim() || "Agent 任务未正常结束。",
      status: "error",
    };
  });

  return changed ? settled : messages;
};
