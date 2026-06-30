import type {
  AgentDefinitionsResult,
  AgentToolsResult,
  AskUserInput,
  ChatResult,
  PongResult,
  RuntimeModelsResult,
  ShutdownAckResult,
  TaskResult,
} from "./protocol/agent.js";
import type { AgentRuntimeCommand } from "./protocol/command.js";
import type { AgentRuntimeEvent } from "./protocol/event.js";
import type {
  AgentRunInput,
  AgentToolsQuery,
  AnswerQuestionInput,
  AppendSessionMessagesInput,
  ChatInput,
  CollaborationTimelineQuery,
  CompactSessionInput,
  CreateSessionInput,
  DeleteSessionMessageInput,
  EditSessionMessageInput,
  ReadSessionInput,
  RebuildAgentSessionInput,
  RebuildSessionInput,
  RunChatInput,
  RunCollaborationInput,
  RunCollaborationModeInput,
  RuntimeSessionQuery,
  RuntimeSessionsQuery,
  SendMessageInput,
  SummarizeSessionInput,
} from "./protocol/input.js";
import type {
  AgentRuntimeResult,
  CollaborationModesRuntimeResult,
  CollaborationRuntimeResult,
  CollaborationTimelineResult,
  RuntimeSessionResult,
  RuntimeSessionsResult,
} from "./protocol/result.js";
import type {
  SessionMutationResult,
  SessionResult,
} from "./protocol/session.js";

export type EmitAgentRuntimeEvent = (event: AgentRuntimeEvent) => void;
export type EmitAgentRuntimeResult = (result: AgentRuntimeResult) => void;

export type RuntimeUserInputRequest = {
  taskId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

export type RuntimeUserInputHandler = (
  request: RuntimeUserInputRequest,
) => Promise<string>;

export type RuntimeEngineCallbacks = {
  requestUserInput?: RuntimeUserInputHandler;
  onEvent?: EmitAgentRuntimeEvent;
  onResult?: EmitAgentRuntimeResult;
};

export type RuntimeEngineOptions = {
  callbacks?: RuntimeEngineCallbacks;
  close?: () => void;
};

export abstract class AgentRuntimeEngine {
  abstract readonly id: string;

  abstract handle(command: AgentRuntimeCommand): Promise<boolean>;

  abstract ping(): Promise<PongResult>;
  abstract shutdown(): Promise<ShutdownAckResult>;
  abstract waitForRunningTask(): Promise<void>;

  abstract listAgents(): Promise<AgentDefinitionsResult>;
  abstract listAgentTools(input?: AgentToolsQuery): Promise<AgentToolsResult>;
  abstract listRuntimeModels(): Promise<RuntimeModelsResult>;
  abstract sendMessage(input: SendMessageInput): Promise<ChatResult | TaskResult>;
  abstract answerQuestion(input: AnswerQuestionInput): Promise<void>;
  abstract runChat(input: RunChatInput): Promise<ChatResult>;
  abstract chat(input: ChatInput): Promise<ChatResult>;
  abstract runAgent(input: AgentRunInput): Promise<TaskResult>;

  abstract createSession(input: CreateSessionInput): Promise<SessionMutationResult>;
  abstract readSession(input: ReadSessionInput): Promise<SessionResult>;
  abstract compactSession(input: CompactSessionInput): Promise<SessionMutationResult>;
  abstract rebuildAgentSession(
    input: RebuildAgentSessionInput,
  ): Promise<SessionMutationResult>;
  abstract summarizeSession(input: SummarizeSessionInput): Promise<SessionMutationResult>;
  abstract editSessionMessage(input: EditSessionMessageInput): Promise<SessionMutationResult>;
  abstract deleteSessionMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult>;
  abstract appendSessionMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult>;
  abstract rebuildSession(input: RebuildSessionInput): Promise<SessionMutationResult>;

  abstract listRuntimeSessions(
    input: RuntimeSessionsQuery,
  ): Promise<RuntimeSessionsResult>;
  abstract readRuntimeSession(input: RuntimeSessionQuery): Promise<RuntimeSessionResult>;
  abstract readCollaborationTimeline(
    input: CollaborationTimelineQuery,
  ): Promise<CollaborationTimelineResult>;

  abstract listCollaborationModes(): Promise<CollaborationModesRuntimeResult>;
  abstract runCollaboration(input: RunCollaborationInput): Promise<CollaborationRuntimeResult>;
  abstract runCollaborationMode(
    input: RunCollaborationModeInput,
  ): Promise<CollaborationRuntimeResult>;
}
