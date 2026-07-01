import { useCallback, useMemo, useRef, useState } from "react";
import { useChatSessionsStore } from "../../session-store";
import type {
  ChatMessage,
  PendingAgentQuestion,
} from "../../types";

const getRunningAgentSessionKey = (workspacePath: string, sessionId: string) =>
  `${workspacePath}\u0000${sessionId}`;

export type RunningAgentTaskContext = {
  taskId: string;
  workspacePath: string;
  sessionId: string;
  title: string;
  messageId: string;
  agentSessionId: string;
  messages: ChatMessage[];
  pendingQuestion: PendingAgentQuestion | null;
  questionAnswer: string;
  customQuestionAnswer: string;
  lastError: string;
  lastStderr: string;
  handledTerminal: boolean;
};

type UseRunningAgentTasksInput = {
  workspacePath: string;
  currentSessionId: string | null;
  activeAgentTaskId: string;
};

export const useRunningAgentTasks = ({
  workspacePath,
  currentSessionId,
  activeAgentTaskId,
}: UseRunningAgentTasksInput) => {
  const runningAgentTasksRef = useRef<Map<string, RunningAgentTaskContext>>(new Map());
  const [runningAgentSessionKeys, setRunningAgentSessionKeys] = useState<Set<string>>(() => new Set());
  const setSessionRunning = useChatSessionsStore((store) => store.setSessionRunning);

  const visibleActiveAgentTaskId = useMemo(() => {
    if (!activeAgentTaskId) {
      return "";
    }

    const runningTask = runningAgentTasksRef.current.get(activeAgentTaskId);
    if (!runningTask) {
      return "";
    }

    return runningTask.workspacePath === workspacePath && runningTask.sessionId === currentSessionId
      ? activeAgentTaskId
      : "";
  }, [activeAgentTaskId, currentSessionId, runningAgentSessionKeys, workspacePath]);

  const addRunningAgentTask = useCallback((task: RunningAgentTaskContext) => {
    runningAgentTasksRef.current.set(task.taskId, task);
    setSessionRunning(task.workspacePath, task.sessionId, true);
    const key = getRunningAgentSessionKey(task.workspacePath, task.sessionId);
    setRunningAgentSessionKeys((current) => {
      if (current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }, [setSessionRunning]);

  const removeRunningAgentTask = useCallback((taskId?: string) => {
    if (!taskId) {
      return;
    }

    const task = runningAgentTasksRef.current.get(taskId);
    if (!task) {
      return;
    }

    runningAgentTasksRef.current.delete(taskId);
    const key = getRunningAgentSessionKey(task.workspacePath, task.sessionId);
    const hasRemainingTaskForSession = [...runningAgentTasksRef.current.values()].some((currentTask) =>
      currentTask.workspacePath === task.workspacePath && currentTask.sessionId === task.sessionId
    );
    if (hasRemainingTaskForSession) {
      return;
    }

    setSessionRunning(task.workspacePath, task.sessionId, false);
    setRunningAgentSessionKeys((current) => {
      if (!current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, [setSessionRunning]);

  return {
    runningAgentTasksRef,
    visibleActiveAgentTaskId,
    addRunningAgentTask,
    removeRunningAgentTask,
  };
};
