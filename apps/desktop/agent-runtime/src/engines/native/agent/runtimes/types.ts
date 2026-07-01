import type {
  AgentEvent,
  AgentRuntimeResources,
  AskUserInput,
  ChatMessageInput,
  ChatResult,
  RuntimeAgentDefinition,
  RuntimeModelInput,
} from "../../../protocol/index.js";
import type { RuntimeSessionLink } from "../../session/model/runtime-command.js";

export type ChatRunResult = Omit<ChatResult, "type" | "requestId">;

export type AgentRunCommand = {
  runtimeMode: "agent";
  requestId?: string | null;
  agentId?: string | null;
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
  agentSessionDir?: string | null;
};

export type RuntimeAgentCompactCommand = RuntimeAgentCommand & {
  compactInstructions?: string | null;
};

export type AgentCompactResult = {
  compacted: boolean;
  message?: string | null;
  details?: unknown;
};

export type ChatRunCommand = {
  type: "chat";
  requestId?: string | null;
  agentId?: string | null;
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

export type AgentRuntimeContext = RuntimeEmitContext & {
  callbacks: AgentRuntimeCallbacks;
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
  ): Promise<AgentCompactResult>;
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
