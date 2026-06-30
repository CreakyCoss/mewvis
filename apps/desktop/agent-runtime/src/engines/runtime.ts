import type {
  AgentDefinitionsResult,
  AgentRuntimeCommand,
  AgentRuntimeEvent,
  AgentRuntimeResult,
  AgentRunInput,
  AgentToolsResult,
  AgentToolsQuery,
  AnswerQuestionInput,
  AppendSessionMessagesInput,
  AskUserInput,
  ChatInput,
  ChatResult,
  CollaborationModesRuntimeResult,
  CollaborationRuntimeResult,
  CollaborationTimelineQuery,
  CollaborationTimelineResult,
  CompactSessionInput,
  CreateSessionInput,
  DeleteSessionMessageInput,
  EditSessionMessageInput,
  PongResult,
  RebuildAgentSessionInput,
  RebuildSessionInput,
  ReadSessionInput,
  RunChatInput,
  RunCollaborationInput,
  RunCollaborationModeInput,
  RuntimeModelsResult,
  RuntimeSessionQuery,
  RuntimeSessionResult,
  RuntimeSessionsQuery,
  RuntimeSessionsResult,
  SendMessageInput,
  SessionMutationResult,
  SessionResult,
  ShutdownAckResult,
  SummarizeSessionInput,
  TaskResult,
} from "./protocol/index.js";

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
