import { useCallback, useMemo, useRef, useState } from "react";
import type { RunningAgentTaskContext } from "./agent-task";
import { getRunningAgentSessionKey } from "./running-agent-session";

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

  const isAgentTaskRunningForSession = useCallback((targetWorkspacePath: string, sessionId: string) => {
    return runningAgentSessionKeys.has(getRunningAgentSessionKey(targetWorkspacePath, sessionId));
  }, [runningAgentSessionKeys]);

  const addRunningAgentTask = useCallback((task: RunningAgentTaskContext) => {
    runningAgentTasksRef.current.set(task.taskId, task);
    const key = getRunningAgentSessionKey(task.workspacePath, task.sessionId);
    setRunningAgentSessionKeys((current) => {
      if (current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }, []);

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

    setRunningAgentSessionKeys((current) => {
      if (!current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);

  return {
    runningAgentTasksRef,
    visibleActiveAgentTaskId,
    isAgentTaskRunningForSession,
    addRunningAgentTask,
    removeRunningAgentTask,
  };
};
