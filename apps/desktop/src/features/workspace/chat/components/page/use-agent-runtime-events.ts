import { useCallback, useEffect, type MutableRefObject } from "react";
import {
  buildAgentConversationContent,
  buildAgentExecutionSummary,
  recordAgentMemoryEvent,
  type AgentMemoryTrace,
} from "@/ai/agent-runtime/memory";
import type { AgentRuntime } from "@/ai/agent-runtime/runtime";
import type { AgentRuntimeAgentEvent } from "@/ai/agent-runtime/contracts";
import type { PendingAgentQuestion } from "../../page-types";
import type { ChatMessage, ChatTraceTurn } from "../../types";
import {
  applyAgentEventToMessage,
  isAgentMessageStreamEvent,
  isTimelineEvent,
} from "../../utils/agent-blocks";
import {
  agentEventTraceStep,
  type ChatTraceStepInput,
} from "./trace";
import {
  pendingQuestionFromEvent,
  type RunningAgentTaskContext,
} from "./agent-task";

type ResetActiveAgentTaskState = (options?: {
  clearQuestion?: boolean;
  clearSession?: boolean;
  clearTerminalState?: boolean;
  resetTrace?: boolean;
}) => void;

type UseAgentRuntimeEventsInput = {
  agentRuntime: AgentRuntime;
  workspacePath: string;
  currentSessionIdRef: MutableRefObject<string | null>;
  activeAgentTaskIdRef: MutableRefObject<string>;
  activeAgentMessageIdRef: MutableRefObject<string>;
  activeAgentTraceRef: MutableRefObject<AgentMemoryTrace>;
  lastAgentErrorRef: MutableRefObject<string>;
  lastAgentStderrRef: MutableRefObject<string>;
  handledAgentDoneTaskIdsRef: MutableRefObject<Set<string>>;
  runningAgentTasksRef: MutableRefObject<Map<string, RunningAgentTaskContext>>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  updateMessage: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void;
  appendAgentConversationResult: (
    assistantText: string,
    status: "done" | "error",
    statusMessage?: string,
  ) => void;
  appendRunningAgentTaskTraceStep: (
    task: RunningAgentTaskContext,
    step: ChatTraceStepInput,
  ) => void;
  patchRunningAgentTaskTraceTurn: (
    task: RunningAgentTaskContext,
    patch: Partial<Omit<ChatTraceTurn, "id" | "steps">>,
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
  scheduleAgentBlockCollapse: (messageId: string, blockId: string) => void;
  setChatError: (message: string) => void;
  loadFiles: () => Promise<void>;
  refreshAgentSessionStatus: () => Promise<void>;
};

const updateRunningAgentTaskMessage = (
  task: RunningAgentTaskContext,
  updater: (message: ChatMessage) => ChatMessage,
) => {
  task.messages = task.messages.map((message) =>
    message.id === task.messageId ? updater(message) : message
  );
};

const appendRunningAgentTaskResult = (
  task: RunningAgentTaskContext,
  assistantText: string,
  status: "done" | "error",
  statusMessage?: string,
) => {
  const executionSummary = buildAgentExecutionSummary(
    task.trace,
    status,
    statusMessage,
  );
  const conversationContent = buildAgentConversationContent(assistantText);
  task.conversation = [
    ...task.conversation,
    {
      id: task.messageId,
      role: "assistant",
      content: conversationContent,
      timestamp: Date.now(),
      metadata: {
        executionSummary,
        runStatus: status,
        runtimeSessionId: task.agentSessionId,
      },
    },
  ];
};

export const useAgentRuntimeEvents = ({
  agentRuntime,
  workspacePath,
  currentSessionIdRef,
  activeAgentTaskIdRef,
  activeAgentMessageIdRef,
  activeAgentTraceRef,
  lastAgentErrorRef,
  lastAgentStderrRef,
  handledAgentDoneTaskIdsRef,
  runningAgentTasksRef,
  messagesRef,
  updateMessage,
  appendAgentConversationResult,
  appendRunningAgentTaskTraceStep,
  patchRunningAgentTaskTraceTurn,
  persistRunningAgentTask,
  removeRunningAgentTask,
  applyAgentQuestionDraft,
  clearPendingAgentQuestion,
  restoreRunningAgentTaskView,
  resetActiveAgentTaskState,
  scheduleAgentBlockCollapse,
  setChatError,
  loadFiles,
  refreshAgentSessionStatus,
}: UseAgentRuntimeEventsInput) => {
  const handleBackgroundAgentEvent = useCallback((task: RunningAgentTaskContext, event: AgentRuntimeAgentEvent) => {
    recordAgentMemoryEvent(task.trace, event);
    const traceStep = agentEventTraceStep(event);
    if (traceStep) {
      appendRunningAgentTaskTraceStep(task, traceStep);
    }

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
      appendRunningAgentTaskResult(task, event.message, "error", event.message);
      patchRunningAgentTaskTraceTurn(task, { status: "error" });
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
      return;
    }

    if (event.type === "done") {
      if (task.handledTerminal) {
        return;
      }
      task.handledTerminal = true;
      const assistantText = event.text.trim();
      const conversationText = assistantText || "Agent 任务已完成。";
      updateRunningAgentTaskMessage(task, (message) =>
        applyAgentEventToMessage(message, event).message
      );
      appendRunningAgentTaskResult(task, conversationText, "done");
      patchRunningAgentTaskTraceTurn(task, { status: "done" });
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
      appendRunningAgentTaskResult(task, message, "error", message);
      patchRunningAgentTaskTraceTurn(task, { status: "error" });
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
    }
  }, [
    appendRunningAgentTaskTraceStep,
    clearPendingAgentQuestion,
    patchRunningAgentTaskTraceTurn,
    persistRunningAgentTask,
    removeRunningAgentTask,
  ]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    let visibleStreamMessageId = "";
    let visibleStreamEvents: AgentRuntimeAgentEvent[] = [];
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

      const thinkingBlockIds: string[] = [];
      updateMessage(messageId, (message) => {
        let nextMessage = message;

        events.forEach((streamEvent) => {
          const appliedEvent = applyAgentEventToMessage(nextMessage, streamEvent);
          nextMessage = appliedEvent.message;
          if (appliedEvent.thinkingBlockId) {
            thinkingBlockIds.push(appliedEvent.thinkingBlockId);
          }
        });

        return nextMessage;
      });

      thinkingBlockIds.forEach((blockId) => {
        scheduleAgentBlockCollapse(messageId, blockId);
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
      event: AgentRuntimeAgentEvent,
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

    void agentRuntime.subscribe((event) => {
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

      recordAgentMemoryEvent(activeAgentTraceRef.current, event);
      const traceStep = agentEventTraceStep(event);
      if (taskContext && traceStep) {
        appendRunningAgentTaskTraceStep(taskContext, traceStep);
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
        const appliedEvent = applyVisibleAgentMessageEvent();
        if (appliedEvent?.completedToolBlockId && event.type === "tool_end" && !event.isError) {
          scheduleAgentBlockCollapse(messageId, appliedEvent.completedToolBlockId);
        }
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

        const assistantText = event.text.trim();
        const conversationText = assistantText || "Agent 任务已完成。";
        updateMessage(messageId, (message) => applyAgentEventToMessage(message, event).message);
        appendAgentConversationResult(conversationText, "done");
        if (taskContext) {
          patchRunningAgentTaskTraceTurn(taskContext, { status: "done" });
        }
        removeRunningAgentTask(event.taskId);
        resetActiveAgentTaskState();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void loadFiles();
        void refreshAgentSessionStatus();
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
        appendAgentConversationResult(event.message, "error", event.message);
        if (taskContext) {
          patchRunningAgentTaskTraceTurn(taskContext, { status: "error" });
        }
        if (terminalTaskId) {
          removeRunningAgentTask(terminalTaskId);
        }
        resetActiveAgentTaskState();
        void refreshAgentSessionStatus();
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
        appendAgentConversationResult(message, "error", message);
        if (taskContext) {
          patchRunningAgentTaskTraceTurn(taskContext, { status: "error" });
        }
        removeRunningAgentTask(event.taskId);
        resetActiveAgentTaskState();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void refreshAgentSessionStatus();
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
    activeAgentTraceRef,
    agentRuntime,
    appendAgentConversationResult,
    appendRunningAgentTaskTraceStep,
    applyAgentQuestionDraft,
    clearPendingAgentQuestion,
    currentSessionIdRef,
    handledAgentDoneTaskIdsRef,
    handleBackgroundAgentEvent,
    lastAgentErrorRef,
    lastAgentStderrRef,
    loadFiles,
    messagesRef,
    patchRunningAgentTaskTraceTurn,
    refreshAgentSessionStatus,
    removeRunningAgentTask,
    resetActiveAgentTaskState,
    restoreRunningAgentTaskView,
    runningAgentTasksRef,
    scheduleAgentBlockCollapse,
    setChatError,
    updateMessage,
    workspacePath,
  ]);
};
