import type {
  AgentEvent,
  AgentRuntimeResources,
  AskUserInput,
  ChatMessageInput,
  ChatResult,
  RuntimeAgentDefinition,
  RuntimeModelInput,
  SessionMutationResult,
  SessionResult,
} from "../../../../protocol/index.js";
import type { RuntimeAgentVisibleContext } from "../../session/model/agent-context.js";
import type { RuntimeSessionLink } from "../../session/model/runtime-command.js";

export type ChatRunResult = Omit<ChatResult, "type" | "requestId">;

export type AgentRunCommand = {
  runtimeMode: "agent";
  requestId?: string | null;
  runtimeId?: string | null;
  taskId: string;
  workspacePath: string;
  sessionRootDir?: string | null;
  agentRoleId?: string | null;
  userMessage: string;
  recordUserMessage?: boolean | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
  sessionLink?: RuntimeSessionLink | null;
};

export type RuntimeAgentCommand = AgentRunCommand & {
  agentTaskPrompt: string;
  sessionBootstrapContext?: string | null;
  nativeSessionContextRef?: {
    agentRoleId: string;
    anchorRecordId?: string | null;
  } | null;
  agentSessionDir?: string | null;
};

export type RuntimeAgentSessionMaintenanceCommand = {
  requestId?: string | null;
  runtimeId?: string | null;
  taskId: string;
  workspacePath: string;
  sessionRootDir: string;
  agentRoleId: string;
  agentSessionId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
  agentSessionDir?: string | null;
};

export type RuntimeAgentCompactCommand = RuntimeAgentSessionMaintenanceCommand & {
  compactInstructions?: string | null;
};

export type RuntimeAgentRebuildCommand = RuntimeAgentSessionMaintenanceCommand & {
  rebuildInstruction?: string | null;
  userMessage?: string | null;
};

export type RuntimeAgentSummarizeCommand = RuntimeAgentSessionMaintenanceCommand & {
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
};

export type ChatRunCommand = {
  type: "chat";
  requestId?: string | null;
  runtimeId?: string | null;
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  streamId?: string | null;
  stream?: boolean;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt?: string | null;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  recordUserMessage?: boolean | null;
  sessionLink?: RuntimeSessionLink | null;
  messages: ChatMessageInput[];
};

export type AgentRunResult = {
  text: string;
};

export type UserInputRequest = {
  taskId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

export type UserInputHandler = (request: UserInputRequest) => Promise<string>;

export type EmitAgentEvent = (event: AgentEvent) => void;

export type RuntimeEmitContext = {
  emit: EmitAgentEvent;
};

export type AgentRuntimeCallbacks = {
  requestUserInput: UserInputHandler;
};

export type AgentRuntimeNativeSession = {
  readSession(): Promise<SessionResult>;
  readAgentVisibleContext(input: {
    agentRoleId: string;
    anchorRecordId?: string | null;
  }): Promise<RuntimeAgentVisibleContext>;
};

export type AgentRuntimeContext = RuntimeEmitContext & {
  callbacks: AgentRuntimeCallbacks;
  nativeSession?: AgentRuntimeNativeSession;
};

export type ChatRuntimeContext = RuntimeEmitContext & {
  signal?: AbortSignal;
  maxRetries?: number;
};

export type RuntimeMode = "agent" | "chat";

export type AgentRuntime = {
  readonly id: string;
  run(
    command: RuntimeAgentCommand,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult>;
  compact?(
    command: RuntimeAgentCompactCommand,
    context: AgentRuntimeContext,
  ): Promise<SessionMutationResult>;
  rebuild?(
    command: RuntimeAgentRebuildCommand,
    context: AgentRuntimeContext,
  ): Promise<SessionMutationResult>;
  summarize?(
    command: RuntimeAgentSummarizeCommand,
    context: AgentRuntimeContext,
  ): Promise<SessionMutationResult>;
};

export type ChatRuntime = {
  readonly id: string;
  chat(
    command: ChatRunCommand,
    context: ChatRuntimeContext,
  ): Promise<ChatRunResult>;
};

export type RuntimeAgent = RuntimeAgentDefinition & {
  agent?: AgentRuntime;
  chat?: ChatRuntime;
};
