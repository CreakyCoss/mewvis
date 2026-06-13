import { useCallback, useRef, useState, type RefObject } from "react";
import type { ChatTraceTurn } from "../../types";
import type { RunningAgentTaskContext } from "./agent-task";
import {
  appendTraceStepToTurns,
  patchTraceTurn,
  type ChatTraceStepInput,
} from "./trace";

type UseChatTraceStateInput = {
  workspacePath: string;
  currentSessionIdRef: RefObject<string | null>;
  runningAgentTasksRef: RefObject<Map<string, RunningAgentTaskContext>>;
};

export const useChatTraceState = ({
  workspacePath,
  currentSessionIdRef,
  runningAgentTasksRef,
}: UseChatTraceStateInput) => {
  const chatTraceRef = useRef<ChatTraceTurn[]>([]);
  const [chatTrace, setChatTrace] = useState<ChatTraceTurn[]>([]);

  const replaceChatTrace = useCallback((nextTrace: ChatTraceTurn[]) => {
    chatTraceRef.current = nextTrace;
    setChatTrace(nextTrace);
  }, []);

  const updateChatTrace = useCallback((
    updater: (current: ChatTraceTurn[]) => ChatTraceTurn[],
  ) => {
    setChatTrace((current) => {
      const next = updater(current);
      chatTraceRef.current = next;
      return next;
    });
  }, []);

  const appendVisibleTraceStep = useCallback((
    turnId: string,
    step: ChatTraceStepInput,
  ) => {
    updateChatTrace((current) => appendTraceStepToTurns(current, turnId, step));
  }, [updateChatTrace]);

  const patchVisibleTraceTurn = useCallback((
    turnId: string,
    patch: Partial<Omit<ChatTraceTurn, "id" | "steps">>,
  ) => {
    updateChatTrace((current) => patchTraceTurn(current, turnId, patch));
  }, [updateChatTrace]);

  const updateRunningAgentTaskTrace = useCallback((
    task: RunningAgentTaskContext,
    updater: (current: ChatTraceTurn[]) => ChatTraceTurn[],
  ) => {
    const nextTrace = updater(task.chatTrace);
    task.chatTrace = nextTrace;

    if (task.workspacePath === workspacePath && task.sessionId === currentSessionIdRef.current) {
      replaceChatTrace(nextTrace);
    }
  }, [currentSessionIdRef, replaceChatTrace, workspacePath]);

  const appendRunningAgentTaskTraceStep = useCallback((
    task: RunningAgentTaskContext,
    step: ChatTraceStepInput,
  ) => {
    updateRunningAgentTaskTrace(
      task,
      (current) => appendTraceStepToTurns(current, task.traceTurnId, step),
    );
  }, [updateRunningAgentTaskTrace]);

  const patchRunningAgentTaskTraceTurn = useCallback((
    task: RunningAgentTaskContext,
    patch: Partial<Omit<ChatTraceTurn, "id" | "steps">>,
  ) => {
    updateRunningAgentTaskTrace(
      task,
      (current) => patchTraceTurn(current, task.traceTurnId, patch),
    );
  }, [updateRunningAgentTaskTrace]);

  const clearChatTrace = useCallback(() => {
    runningAgentTasksRef.current?.forEach((task) => {
      if (task.workspacePath === workspacePath && task.sessionId === currentSessionIdRef.current) {
        task.chatTrace = [];
      }
    });
    replaceChatTrace([]);
  }, [currentSessionIdRef, replaceChatTrace, runningAgentTasksRef, workspacePath]);

  return {
    chatTrace,
    chatTraceRef,
    replaceChatTrace,
    appendVisibleTraceStep,
    patchVisibleTraceTurn,
    appendRunningAgentTaskTraceStep,
    patchRunningAgentTaskTraceTurn,
    clearChatTrace,
  };
};
