import { invoke } from "@/transport";
import { listen } from "@/transport";
import type {
  AgentRuntimeTauriAgentInput,
  AgentRuntimeTauriChatInput,
  AgentRuntimeTauriCollaborationInput,
  AgentRuntimeTauriCollaborationModeInput,
  AgentRuntimeTauriCommandArgs,
  AgentRuntimeTauriCommandName,
  AgentRuntimeTauriCommandResult,
  AgentRuntimeTauriEventName,
  AgentRuntimeTauriEventPayload,
} from "@/agent-client/contracts/tauri";
import type { AgentClientLedgerSummaryInput, AgentClientListRuntimeSessionsInput } from "@/agent-client/contracts";
import type {
  AnswerQuestionParams,
  AnswerApprovalParams,
  CollaborationTimelineParams,
  RuntimeSessionDebugParams,
  RuntimeSessionParams,
  SessionTargetParams,
} from "@/agent-client/wire";

const invokeAgentRuntime = <TName extends AgentRuntimeTauriCommandName>(
  command: TName,
  args: AgentRuntimeTauriCommandArgs<TName>,
) => invoke<AgentRuntimeTauriCommandResult<TName>>(command, args);

const listenAgentRuntimeEvent = <TName extends AgentRuntimeTauriEventName>(
  eventName: TName,
  listener: (event: AgentRuntimeTauriEventPayload<TName>) => void,
) =>
  listen<AgentRuntimeTauriEventPayload<TName>>(eventName, (event) => {
    listener(event.payload);
  });

export const listAgentRuntimeTools = (input: AgentRuntimeTauriCommandArgs<"list_agent_runtime_tools">["input"] = {}) =>
  invokeAgentRuntime("list_agent_runtime_tools", { input });

export const getAgentRuntimeSandboxStatus = () => invokeAgentRuntime("get_agent_runtime_sandbox_status", {});
export const setAgentRuntimeSandboxEnabled = (enabled: boolean) =>
  invokeAgentRuntime("set_agent_runtime_sandbox_enabled", { enabled });

export const initializeAgentRuntimeSandbox = () => invokeAgentRuntime("initialize_agent_runtime_sandbox", {});

export const runAgentRuntimeChat = (input: AgentRuntimeTauriChatInput) =>
  invokeAgentRuntime("run_agent_runtime_chat", { input });

export const runAgentRuntimeAgent = (input: AgentRuntimeTauriAgentInput) =>
  invokeAgentRuntime("run_agent_runtime_agent", { input });

export const getAgentRuntimeSessionDebug = (input: RuntimeSessionDebugParams) =>
  invokeAgentRuntime("get_agent_runtime_session_debug", { input });

export const listAgentRuntimeSessions = (input: AgentClientListRuntimeSessionsInput) =>
  invokeAgentRuntime("list_agent_runtime_sessions", { input });

export const getAgentRuntimeSession = (input: RuntimeSessionParams) =>
  invokeAgentRuntime("get_agent_runtime_session", { input });

export const runAgentRuntimeCollaboration = (input: AgentRuntimeTauriCollaborationInput) =>
  invokeAgentRuntime("run_agent_runtime_collaboration", { input });

export const runAgentRuntimeCollaborationMode = (input: AgentRuntimeTauriCollaborationModeInput) =>
  invokeAgentRuntime("run_agent_runtime_collaboration_mode", { input });

export const getAgentRuntimeCollaborationTimeline = (input: CollaborationTimelineParams) =>
  invokeAgentRuntime("get_agent_runtime_collaboration_timeline", { input });

export const answerAgentRuntimeApproval = (input: AnswerApprovalParams) =>
  invokeAgentRuntime("answer_agent_runtime_approval", { input });

export const answerAgentRuntimeQuestion = (input: AnswerQuestionParams) =>
  invokeAgentRuntime("answer_agent_runtime_question", { input });

export const abortAgentRuntimeTask = (taskId: string) => invokeAgentRuntime("abort_agent_runtime_agent", { taskId });

export const readAgentRuntimeSession = (input: SessionTargetParams) =>
  invokeAgentRuntime("read_agent_runtime_session", { input });

export const deleteAgentRuntimeSession = (input: SessionTargetParams) =>
  invokeAgentRuntime("delete_agent_runtime_session", { input });

export const summarizeAgentRuntimeSession = (input: AgentClientLedgerSummaryInput) =>
  invokeAgentRuntime("summarize_agent_runtime_session", { input });

export const listenAgentRuntimeAgentEvents = (
  listener: (event: AgentRuntimeTauriEventPayload<"agent_runtime_agent_event">) => void,
) => listenAgentRuntimeEvent("agent_runtime_agent_event", listener);

export const listenAgentRuntimeChatEvents = (
  listener: (event: AgentRuntimeTauriEventPayload<"agent_runtime_chat_event">) => void,
) => listenAgentRuntimeEvent("agent_runtime_chat_event", listener);

export const releaseAgentRuntimeSession = (input: SessionTargetParams) =>
  invokeAgentRuntime("release_agent_runtime_session", { input });
