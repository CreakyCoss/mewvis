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

export abstract class BaseAgent {
  constructor(readonly id: string) {}

  abstract run(
    command: StartTaskCommand,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult>;
}

export abstract class BaseChatRuntime {
  constructor(readonly id: string) {}

  abstract chat(
    command: ChatCommand,
    context: ChatRuntimeContext,
  ): Promise<ChatResult>;
}

export type AgentRuntime = BaseAgent;

export type ChatRuntime = BaseChatRuntime;

export type BridgeAgent = {
  id: string;
  agent?: AgentRuntime;
  chat?: ChatRuntime;
};
