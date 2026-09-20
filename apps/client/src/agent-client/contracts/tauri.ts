import type {
  AgentClientAgentEvent,
  AgentClientAgentInput,
  AgentClientAgentTask,
  AgentClientAgentToolsResult,
  AgentClientChatEvent,
  AgentClientChatResult,
  AgentClientLedgerResult,
  AgentClientLedgerSummaryInput,
  AgentClientListRuntimeSessionsInput,
} from "./index";
import type {
  EmptyParams,
  AnswerQuestionParams,
  AnswerApprovalParams,
  ChatParams,
  CollaborationModeRunParams,
  CollaborationRunParams,
  CollaborationTimelineParams,
  CollaborationTimelineResult,
  RuntimeSessionDebugParams,
  RuntimeSessionDebugResult,
  RuntimeSessionParams,
  RuntimeSessionResult,
  RuntimeSessionsResult,
  SessionTargetParams,
} from "../wire";
import type { SandboxStatus } from "../../../../agent-runtime/src/security/execution/types";

export type AgentRuntimeTauriChatInput = ChatParams;

export type AgentRuntimeTauriAgentInput = AgentClientAgentInput & {
  chatId?: string | null;
};

export type AgentRuntimeTauriCollaborationInput = CollaborationRunParams;
export type AgentRuntimeTauriCollaborationModeInput = CollaborationModeRunParams;

export type AgentRuntimeTauriCommands = {
  set_agent_runtime_sandbox_enabled: {
    args: { enabled: boolean };
    result: SandboxStatus;
  };
  get_agent_runtime_sandbox_status: {
    args: Record<string, never>;
    result: SandboxStatus;
  };
  initialize_agent_runtime_sandbox: {
    args: Record<string, never>;
    result: SandboxStatus;
  };
  list_agent_runtime_tools: {
    args: { input: EmptyParams };
    result: AgentClientAgentToolsResult;
  };
  run_agent_runtime_chat: {
    args: { input: AgentRuntimeTauriChatInput };
    result: AgentClientChatResult;
  };
  run_agent_runtime_agent: {
    args: { input: AgentRuntimeTauriAgentInput };
    result: AgentClientAgentTask;
  };
  get_agent_runtime_session_debug: {
    args: { input: RuntimeSessionDebugParams };
    result: RuntimeSessionDebugResult;
  };
  list_agent_runtime_sessions: {
    args: { input: AgentClientListRuntimeSessionsInput };
    result: RuntimeSessionsResult;
  };
  get_agent_runtime_session: {
    args: { input: RuntimeSessionParams };
    result: RuntimeSessionResult;
  };
  run_agent_runtime_collaboration: {
    args: { input: AgentRuntimeTauriCollaborationInput };
    result: AgentClientAgentTask;
  };
  run_agent_runtime_collaboration_mode: {
    args: { input: AgentRuntimeTauriCollaborationModeInput };
    result: AgentClientAgentTask;
  };
  get_agent_runtime_collaboration_timeline: {
    args: { input: CollaborationTimelineParams };
    result: CollaborationTimelineResult;
  };
  answer_agent_runtime_approval: { args: { input: AnswerApprovalParams }; result: void };
  answer_agent_runtime_question: {
    args: { input: AnswerQuestionParams };
    result: void;
  };
  abort_agent_runtime_agent: {
    args: { taskId: string };
    result: void;
  };
  read_agent_runtime_session: {
    args: { input: SessionTargetParams };
    result: AgentClientLedgerResult;
  };
  release_agent_runtime_session: {
    args: { input: SessionTargetParams };
    result: void;
  };
  delete_agent_runtime_session: {
    args: { input: SessionTargetParams };
    result: void;
  };
  summarize_agent_runtime_session: {
    args: { input: AgentClientLedgerSummaryInput };
    result: AgentClientLedgerResult;
  };
};

export type AgentRuntimeTauriCommandName = keyof AgentRuntimeTauriCommands;
export const agentRuntimeTauriCommandNames = [
  "get_agent_runtime_sandbox_status",
  "initialize_agent_runtime_sandbox",
  "set_agent_runtime_sandbox_enabled",
  "list_agent_runtime_tools",
  "run_agent_runtime_chat",
  "run_agent_runtime_agent",
  "get_agent_runtime_session_debug",
  "list_agent_runtime_sessions",
  "get_agent_runtime_session",
  "run_agent_runtime_collaboration",
  "run_agent_runtime_collaboration_mode",
  "get_agent_runtime_collaboration_timeline",
  "answer_agent_runtime_question",
  "answer_agent_runtime_approval",
  "abort_agent_runtime_agent",
  "read_agent_runtime_session",
  "release_agent_runtime_session",
  "delete_agent_runtime_session",
  "summarize_agent_runtime_session",
] as const satisfies readonly AgentRuntimeTauriCommandName[];
export type AgentRuntimeTauriCommandArgs<TName extends AgentRuntimeTauriCommandName> =
  AgentRuntimeTauriCommands[TName]["args"];
export type AgentRuntimeTauriCommandResult<TName extends AgentRuntimeTauriCommandName> =
  AgentRuntimeTauriCommands[TName]["result"];

export type AgentRuntimeTauriEvents = {
  agent_runtime_agent_event: AgentClientAgentEvent;
  agent_runtime_chat_event: AgentClientChatEvent;
};

export type AgentRuntimeTauriEventName = keyof AgentRuntimeTauriEvents;
export const agentRuntimeTauriEventNames = [
  "agent_runtime_agent_event",
  "agent_runtime_chat_event",
] as const satisfies readonly AgentRuntimeTauriEventName[];
export type AgentRuntimeTauriEventPayload<TName extends AgentRuntimeTauriEventName> = AgentRuntimeTauriEvents[TName];
