import { useCallback, useEffect, type MutableRefObject } from "react";
import type { AgentClient } from "@/agent-client/runtime";
import type { AgentClientAgentEvent } from "@/agent-client/contracts";
import type { ChatMessage, PendingAgentQuestion } from "../../types";
import {
  applyAgentEventToMessage,
  isAgentMessageStreamEvent,
  isTimelineEvent,
} from "../../utils/agent-blocks";
import type { RunningAgentTaskContext } from "./use-running-agent-tasks";

type ResetActiveAgentTaskState = (options?: {
  clearQuestion?: boolean;
  clearTerminalState?: boolean;
}) => void;

type AgentDoneEvent = Extract<AgentClientAgentEvent, { type: "done" }>;
type AgentSessionRef = AgentDoneEvent["agentSession"];

const pendingQuestionFromEvent = (
  event: Extract<AgentClientAgentEvent, { type: "question" }>,
): PendingAgentQuestion => ({
  taskId: event.taskId,
  questionId: event.questionId,
  question: event.question,
  context: event.context,
  input: event.input,
});

type UseAgentClientEventsInput = {
  agentClient: AgentClient;
  workspacePath: string;
  currentSessionIdRef: MutableRefObject<string | null>;
  activeAgentTaskIdRef: MutableRefObject<string>;
  activeAgentMessageIdRef: MutableRefObject<string>;
  lastAgentErrorRef: MutableRefObject<string>;
  lastAgentStderrRef: MutableRefObject<string>;
  handledAgentDoneTaskIdsRef: MutableRefObject<Set<string>>;
  runningAgentTasksRef: MutableRefObject<Map<string, RunningAgentTaskContext>>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  updateMessage: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void;
  persistRunningAgentTask: (task: RunningAgentTaskContext) => Promise<void>;
  removeRunningAgentTask: (taskId?: string) => void;
  applyAgentQuestionDraft: (
    question: PendingAgentQuestion | null,
    answer?: string,
    customAnswer?: string,
  ) => void;
  clearPendingAgentQuestion: (questionId: string) => void;
  restoreRunningAgentTaskView: (task: RunningAgentTaskContext) => boolean;
  resetActiveAgentTaskState: ResetActiveAgentTaskState;
  setChatError: (message: string) => void;
  loadFiles: () => Promise<void>;
};

const updateRunningAgentTaskMessage = (
  task: RunningAgentTaskContext,
  updater: (message: ChatMessage) => ChatMessage,
) => {
  task.messages = task.messages.map((message) =>
    message.id === task.messageId ? updater(message) : message
  );
};

const agentMessageRecordIdForMessage = (
  message: ChatMessage,
  agentSession: NonNullable<AgentSessionRef>,
) => message.role === "user"
  ? agentSession.userMessageRecordId ?? null
  : agentSession.assistantMessageRecordId ?? null;

const patchMessagesWithAgentSession = (
  messages: ChatMessage[],
  assistantMessageId: string,
  agentSession?: AgentSessionRef,
) => {
  if (!agentSession) {
    return messages;
  }

  const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId);
  const userMessageId = assistantIndex > 0 && messages[assistantIndex - 1]?.role === "user"
    ? messages[assistantIndex - 1]?.id
    : null;

  return messages.map((message) => {
    if (message.id !== assistantMessageId && message.id !== userMessageId) {
      return message;
    }

    const bridgeMessageRecordId = agentMessageRecordIdForMessage(message, agentSession);
    if (!bridgeMessageRecordId) {
      return message;
    }

    return {
      ...message,
      bridgeMessageRecordId: bridgeMessageRecordId ?? message.bridgeMessageRecordId,
    };
  });
};

export const useAgentClientEvents = ({
  agentClient,
  workspacePath,
  currentSessionIdRef,
  activeAgentTaskIdRef,
  activeAgentMessageIdRef,
  lastAgentErrorRef,
  lastAgentStderrRef,
  handledAgentDoneTaskIdsRef,
  runningAgentTasksRef,
  messagesRef,
  updateMessage,
  persistRunningAgentTask,
  removeRunningAgentTask,
  applyAgentQuestionDraft,
  clearPendingAgentQuestion,
  restoreRunningAgentTaskView,
  resetActiveAgentTaskState,
  setChatError,
  loadFiles,
}: UseAgentClientEventsInput) => {
  const handleBackgroundAgentEvent = useCallback((task: RunningAgentTaskContext, event: AgentClientAgentEvent) => {
    if (isAgentMessageStreamEvent(event)) {
      updateRunningAgentTaskMessage(task, (message) =>
        applyAgentEventToMessage(message, event).message
      );
      return;
    }

    if (isTimelineEvent(event)) {
      updateRunningAgentTaskMessage(task, (message) =>
        applyAgentEventToMessage(message, event).message
      );
    }

    if (event.type === "stderr") {
      task.lastStderr = event.message;
      return;
    }

    if (event.type === "question") {
      task.pendingQuestion = pendingQuestionFromEvent(event);
      task.questionAnswer = event.input?.selected ?? "";
      task.customQuestionAnswer = "";
      return;
    }

    if (event.type === "question_answered") {
      clearPendingAgentQuestion(event.questionId);
      return;
    }

    if (event.type === "error") {
      if (task.handledTerminal) {
        return;
      }
      task.handledTerminal = true;
      task.lastError = event.message;
      updateRunningAgentTaskMessage(task, (message) => ({
        ...message,
        text: event.message,
        status: "error",
      }));
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
      return;
    }

    if (event.type === "done") {
      if (task.handledTerminal) {
        return;
      }
      task.handledTerminal = true;
      updateRunningAgentTaskMessage(task, (message) =>
        applyAgentEventToMessage(message, event).message
      );
      task.messages = patchMessagesWithAgentSession(
        task.messages,
        task.messageId,
        event.agentSession,
      );
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
      return;
    }

    if (event.type === "exit" && !event.success) {
      if (task.handledTerminal) {
        return;
      }
      task.handledTerminal = true;
      const message =
        task.lastError ||
        task.lastStderr ||
        `Agent 任务异常退出：${event.code ?? "unknown"}`;
      updateRunningAgentTaskMessage(task, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
    }
  }, [
    clearPendingAgentQuestion,
    persistRunningAgentTask,
    removeRunningAgentTask,
  ]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    let visibleStreamMessageId = "";
    let visibleStreamEvents: AgentClientAgentEvent[] = [];
    let visibleStreamFrameId: number | null = null;

    const flushVisibleStreamEvents = () => {
      visibleStreamFrameId = null;
      const messageId = visibleStreamMessageId;
      const events = visibleStreamEvents;
      visibleStreamMessageId = "";
      visibleStreamEvents = [];

      if (!messageId || events.length === 0) {
        return;
      }

      updateMessage(messageId, (message) => {
        let nextMessage = message;

        events.forEach((streamEvent) => {
          const appliedEvent = applyAgentEventToMessage(nextMessage, streamEvent);
          nextMessage = appliedEvent.message;
        });

        return nextMessage;
      });
    };

    const cancelVisibleStreamFlush = () => {
      if (visibleStreamFrameId !== null) {
        window.cancelAnimationFrame(visibleStreamFrameId);
        visibleStreamFrameId = null;
      }
    };

    const enqueueVisibleStreamEvent = (
      messageId: string,
      event: AgentClientAgentEvent,
    ) => {
      if (visibleStreamMessageId && visibleStreamMessageId !== messageId) {
        cancelVisibleStreamFlush();
        flushVisibleStreamEvents();
      }

      visibleStreamMessageId = messageId;
      visibleStreamEvents.push(event);
      if (visibleStreamFrameId === null) {
        visibleStreamFrameId = window.requestAnimationFrame(flushVisibleStreamEvents);
      }
    };

    void agentClient.subscribe((event) => {
      const currentTaskId = activeAgentTaskIdRef.current;
      const eventTaskId = event.taskId ?? currentTaskId;
      const taskContext = eventTaskId
        ? runningAgentTasksRef.current.get(eventTaskId)
        : undefined;
      const isEventForVisibleTask = !taskContext ||
        (taskContext.workspacePath === workspacePath && taskContext.sessionId === currentSessionIdRef.current);
      if (eventTaskId !== currentTaskId || !isEventForVisibleTask) {
        if (taskContext) {
          handleBackgroundAgentEvent(taskContext, event);
        }
        return;
      }

      const messageId = activeAgentMessageIdRef.current;
      if (!messageId) {
        if (taskContext) {
          handleBackgroundAgentEvent(taskContext, event);
        }
        return;
      }
      if (
        taskContext &&
        !messagesRef.current.some((message) => message.id === messageId)
      ) {
        restoreRunningAgentTaskView(taskContext);
      }

      const applyVisibleAgentMessageEvent = (): ReturnType<typeof applyAgentEventToMessage> | null => {
        let appliedEvent: ReturnType<typeof applyAgentEventToMessage> | null = null;
        updateMessage(messageId, (message) => {
          appliedEvent = applyAgentEventToMessage(message, event);
          return appliedEvent.message;
        });
        return appliedEvent;
      };

      if (isAgentMessageStreamEvent(event)) {
        enqueueVisibleStreamEvent(messageId, event);
        return;
      }

      flushVisibleStreamEvents();

      if (isTimelineEvent(event)) {
        applyVisibleAgentMessageEvent();
      }

      if (event.type === "question") {
        const pendingQuestion = pendingQuestionFromEvent(event);
        if (taskContext) {
          taskContext.pendingQuestion = pendingQuestion;
          taskContext.questionAnswer = event.input?.selected ?? "";
          taskContext.customQuestionAnswer = "";
        }
        applyAgentQuestionDraft(pendingQuestion, event.input?.selected ?? "");
        return;
      }

      if (event.type === "question_answered") {
        clearPendingAgentQuestion(event.questionId);
        return;
      }

      if (event.type === "done") {
        if (handledAgentDoneTaskIdsRef.current.has(event.taskId)) {
          return;
        }
        handledAgentDoneTaskIdsRef.current.add(event.taskId);

        updateMessage(messageId, (message) => {
          const nextMessage = applyAgentEventToMessage(message, event).message;
          return {
            ...nextMessage,
            bridgeMessageRecordId: event.agentSession?.assistantMessageRecordId ?? nextMessage.bridgeMessageRecordId,
          };
        });
        const assistantIndex = messagesRef.current.findIndex((message) => message.id === messageId);
        const userMessage = assistantIndex > 0 ? messagesRef.current[assistantIndex - 1] : null;
        if (userMessage?.role === "user" && event.agentSession?.userMessageRecordId) {
          updateMessage(userMessage.id, (message) => ({
            ...message,
            bridgeMessageRecordId: event.agentSession?.userMessageRecordId ?? message.bridgeMessageRecordId,
          }));
        }
        removeRunningAgentTask(event.taskId);
        resetActiveAgentTaskState();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void loadFiles();
      }

      if (event.type === "stderr") {
        lastAgentStderrRef.current = event.message;
      }

      if (event.type === "error") {
        const terminalTaskId = event.taskId ?? currentTaskId;
        if (terminalTaskId && handledAgentDoneTaskIdsRef.current.has(terminalTaskId)) {
          return;
        }
        if (terminalTaskId) {
          handledAgentDoneTaskIdsRef.current.add(terminalTaskId);
        }
        lastAgentErrorRef.current = event.message;
        setChatError(event.message);
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.message,
          status: "error",
        }));
        if (terminalTaskId) {
          removeRunningAgentTask(terminalTaskId);
        }
        resetActiveAgentTaskState();
      }

      if (event.type === "exit" && !event.success) {
        if (handledAgentDoneTaskIdsRef.current.has(event.taskId)) {
          return;
        }
        handledAgentDoneTaskIdsRef.current.add(event.taskId);
        const message =
          lastAgentErrorRef.current ||
          lastAgentStderrRef.current ||
          `Agent 任务异常退出：${event.code ?? "unknown"}`;
        setChatError(message);
        updateMessage(messageId, (currentMessage) => ({
          ...currentMessage,
          text: message,
          status: "error",
        }));
        removeRunningAgentTask(event.taskId);
        resetActiveAgentTaskState();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
      }
    }).then((unsubscribe) => {
      if (disposed) {
        unsubscribe();
        return;
      }
      cleanup = unsubscribe;
    });

    return () => {
      disposed = true;
      cancelVisibleStreamFlush();
      cleanup?.();
    };
  }, [
    activeAgentMessageIdRef,
    activeAgentTaskIdRef,
    agentClient,
    applyAgentQuestionDraft,
    clearPendingAgentQuestion,
    currentSessionIdRef,
    handledAgentDoneTaskIdsRef,
    handleBackgroundAgentEvent,
    lastAgentErrorRef,
    lastAgentStderrRef,
    loadFiles,
    messagesRef,
    removeRunningAgentTask,
    resetActiveAgentTaskState,
    restoreRunningAgentTaskView,
    runningAgentTasksRef,
    setChatError,
    updateMessage,
    workspacePath,
  ]);
};
