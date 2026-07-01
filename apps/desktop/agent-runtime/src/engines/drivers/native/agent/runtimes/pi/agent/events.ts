import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  AgentEventType,
} from "../../../../../../protocol/index.js";
import type {
  EmitAgentEvent,
  RuntimeAgentCommand,
} from "../../types.js";
import { messageFromError } from "../../../../error.js";
import type { PiAgentSession } from "./session.js";

export type PiAgentRunState = {
  assistantText: string;
  streamedText: string;
  sessionError: Error | null;
  errorReported: boolean;
};

export const createPiAgentRunState = (): PiAgentRunState => ({
  assistantText: "",
  streamedText: "",
  sessionError: null,
  errorReported: false,
});

export const subscribeToPiAgentSession = (
  command: RuntimeAgentCommand,
  session: PiAgentSession,
  emit: EmitAgentEvent,
  state: PiAgentRunState,
) =>
  session.subscribe((event) => {
    handlePiSessionEvent(command, emit, state, event);
  });

export const throwPiSessionError = (state: PiAgentRunState) => {
  if (state.sessionError) {
    throw state.sessionError;
  }
};

export const reportPiAgentRunError = (
  command: RuntimeAgentCommand,
  emit: EmitAgentEvent,
  error: unknown,
  state: PiAgentRunState,
) => {
  if (state.errorReported) {
    return;
  }

  state.errorReported = true;
  emit({
    type: AgentEventType.Error,
    taskId: command.taskId,
    message: messageFromError(error),
  });
};

const handlePiSessionEvent = (
  command: RuntimeAgentCommand,
  emit: EmitAgentEvent,
  state: PiAgentRunState,
  event: AgentSessionEvent,
) => {
  switch (event.type) {
    case "agent_start":
    case "agent_end":
    case "turn_start":
    case "turn_end":
    case "message_start":
    case "queue_update":
    case "compaction_start":
    case "session_info_changed":
    case "thinking_level_changed":
    case "auto_retry_start":
      return;
    case "compaction_end":
      if (event.errorMessage && !event.willRetry) {
        setPiSessionError(command, emit, state, event.errorMessage);
      }
      return;
    case "auto_retry_end":
      if (!event.success && event.finalError) {
        setPiSessionError(command, emit, state, event.finalError);
      }
      return;
    case "message_update":
      handlePiMessageUpdate(command, emit, state, event);
      return;
    case "message_end":
      handlePiMessageEnd(command, emit, state, event);
      return;
    case "tool_execution_start":
      emit({
        type: AgentEventType.ToolStart,
        taskId: command.taskId,
        toolName: event.toolName,
        args: event.args,
      });
      return;
    case "tool_execution_update":
      emit({
        type: AgentEventType.ToolUpdate,
        taskId: command.taskId,
        toolName: event.toolName,
        partialResult: event.partialResult,
      });
      return;
    case "tool_execution_end":
      emit({
        type: AgentEventType.ToolEnd,
        taskId: command.taskId,
        toolName: event.toolName,
        isError: event.isError,
        result: event.result,
      });
      return;
    default:
      assertNever(event);
  }
};

const handlePiMessageUpdate = (
  command: RuntimeAgentCommand,
  emit: EmitAgentEvent,
  state: PiAgentRunState,
  event: Extract<AgentSessionEvent, { type: "message_update" }>,
) => {
  switch (event.assistantMessageEvent.type) {
    case "text_delta":
      state.assistantText += event.assistantMessageEvent.delta;
      state.streamedText += event.assistantMessageEvent.delta;
      emit({
        type: AgentEventType.TextDelta,
        taskId: command.taskId,
        delta: event.assistantMessageEvent.delta,
      });
      return;
    case "thinking_delta":
      emit({
        type: AgentEventType.ThinkingDelta,
        taskId: command.taskId,
        delta: event.assistantMessageEvent.delta,
      });
      return;
    case "thinking_end":
      emit({
        type: AgentEventType.ThinkingEnd,
        taskId: command.taskId,
        content: event.assistantMessageEvent.content,
      });
      return;
    case "error":
      setPiSessionError(command, emit, state, piMessageError(event.assistantMessageEvent.error));
      return;
    case "start":
    case "text_start":
    case "text_end":
    case "thinking_start":
    case "toolcall_start":
    case "toolcall_delta":
    case "toolcall_end":
    case "done":
      return;
    default:
      assertNever(event.assistantMessageEvent);
  }
};

const handlePiMessageEnd = (
  command: RuntimeAgentCommand,
  emit: EmitAgentEvent,
  state: PiAgentRunState,
  event: Extract<AgentSessionEvent, { type: "message_end" }>,
) => {
  const text = getPiMessageText(event);
  if (text) {
    state.assistantText = text;
  }
  const thinking = getPiMessageThinking(event);
  if (thinking) {
    emit({
      type: AgentEventType.ThinkingEnd,
      taskId: command.taskId,
      content: thinking,
    });
  }
  const error = getPiMessageError(event);
  if (error) {
    setPiSessionError(command, emit, state, error);
  }
};

const getPiMessageText = (event: Extract<AgentSessionEvent, { type: "message_end" }>) =>
  getPiMessageContent(event)
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text)
    .join("")
    .trim();

const getPiMessageThinking = (event: Extract<AgentSessionEvent, { type: "message_end" }>) =>
  getPiMessageContent(event)
    .filter((item): item is { type: "thinking"; thinking: string } => item.type === "thinking")
    .map((item) => item.thinking)
    .join("")
    .trim();

const getPiMessageContent = (event: Extract<AgentSessionEvent, { type: "message_end" }>) =>
  "content" in event.message && Array.isArray(event.message.content)
    ? event.message.content
    : [];

const getPiMessageError = (event: Extract<AgentSessionEvent, { type: "message_end" }>) => {
  const message = event.message;
  if (!("stopReason" in message) || (message.stopReason !== "error" && message.stopReason !== "aborted")) {
    return null;
  }

  return piMessageError(message);
};

const piMessageError = (message: { errorMessage?: string; stopReason?: string }) => {
  if (message.errorMessage) {
    return message.errorMessage;
  }

  return message.stopReason === "aborted" ? "Agent session 已中止" : "Agent session 执行失败";
};

const setPiSessionError = (
  command: RuntimeAgentCommand,
  emit: EmitAgentEvent,
  state: PiAgentRunState,
  message: string,
) => {
  state.sessionError ??= new Error(message);
  reportPiAgentRunError(command, emit, state.sessionError, state);
};

const assertNever = (value: never): never => {
  throw new Error(`Unhandled event: ${JSON.stringify(value)}`);
};
