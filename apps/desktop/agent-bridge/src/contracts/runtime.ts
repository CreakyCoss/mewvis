import type {
  AgentRunResult,
  AskUserInput,
  BridgeEvent,
  ChatCommand,
  ChatResult,
  StartTaskCommand,
} from "./protocol.js";

export type AskUser = (
  taskId: string,
  question: string,
  context?: string | null,
  input?: AskUserInput,
) => Promise<string>;

export type EmitBridgeEvent = (event: BridgeEvent) => void;

export type BridgeEmitContext = {
  emit: EmitBridgeEvent;
};

export type AgentRuntimeContext = BridgeEmitContext & {
  askUser: AskUser;
};

export type ChatRuntimeContext = BridgeEmitContext;

export type RuntimeMode = "agent" | "chat";

export type AgentRuntime = {
  readonly id: string;
  run(
    command: StartTaskCommand,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult>;
};

export type ChatRuntime = {
  readonly id: string;
  chat(
    command: ChatCommand,
    context: ChatRuntimeContext,
  ): Promise<ChatResult>;
};

export type BridgeAgent = {
  id: string;
  agent?: AgentRuntime;
  chat?: ChatRuntime;
};
