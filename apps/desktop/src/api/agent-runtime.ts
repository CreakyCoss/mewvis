import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AnswerQuestionInput,
  CollaborationTimelineQuery,
  RuntimeSessionDebugQuery,
  RuntimeSessionQuery,
} from "@agent-runtime/engines/protocol";
import type { AgentClientAgentEvent, AgentClientChatEvent } from "@/agent-client/contracts/events";
import type { AgentClientChatResult } from "@/agent-client/contracts/inputs";
import type {
  AgentClientCollaborationTimelineResult,
  AgentClientListRuntimeSessionsInput,
  AgentClientRuntimeSessionDebugSnapshot,
  AgentClientRuntimeSessionSnapshot,
  AgentClientRuntimeSessionsResult,
} from "@/agent-client/contracts/session";
import type { AgentClientAgentToolsResult } from "@/agent-client/runtime";

export type RunAgentRuntimeOutput = {
  taskId: string;
};

export const listAgentRuntimeTools = () =>
  invoke<AgentClientAgentToolsResult>("list_agent_runtime_tools", { input: {} });

export const runAgentRuntimeChat = (input: unknown) =>
  invoke<AgentClientChatResult>("run_agent_runtime_chat", { input });

export const runAgentRuntimeAgent = (input: unknown) =>
  invoke<RunAgentRuntimeOutput>("run_agent_runtime_agent", { input });

export const getAgentRuntimeSessionDebug = (input: RuntimeSessionDebugQuery) =>
  invoke<AgentClientRuntimeSessionDebugSnapshot>("get_agent_runtime_session_debug", { input });

export const listAgentRuntimeSessions = (input: AgentClientListRuntimeSessionsInput) =>
  invoke<AgentClientRuntimeSessionsResult>("list_agent_runtime_sessions", { input });

export const getAgentRuntimeSession = (input: RuntimeSessionQuery) =>
  invoke<AgentClientRuntimeSessionSnapshot>("get_agent_runtime_session", { input });

export const runAgentRuntimeCollaboration = (input: unknown) =>
  invoke<RunAgentRuntimeOutput>("run_agent_runtime_collaboration", { input });

export const runAgentRuntimeCollaborationMode = (input: unknown) =>
  invoke<RunAgentRuntimeOutput>("run_agent_runtime_collaboration_mode", { input });

export const getAgentRuntimeCollaborationTimeline = (input: CollaborationTimelineQuery) =>
  invoke<AgentClientCollaborationTimelineResult>("get_agent_runtime_collaboration_timeline", { input });

export const answerAgentRuntimeQuestion = (input: AnswerQuestionInput) =>
  invoke<void>("answer_agent_runtime_question", { input });

export const abortAgentRuntimeTask = (taskId: string) => invoke<void>("abort_agent_runtime_agent", { taskId });

export const listenAgentRuntimeAgentEvents = (listener: (event: AgentClientAgentEvent) => void) =>
  listen<AgentClientAgentEvent>("agent_runtime_agent_event", (event) => listener(event.payload));

export const listenAgentRuntimeChatEvents = (listener: (event: AgentClientChatEvent) => void) =>
  listen<AgentClientChatEvent>("agent_runtime_chat_event", (event) => listener(event.payload));
