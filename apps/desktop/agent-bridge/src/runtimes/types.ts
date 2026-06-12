import type { BridgeAgentDefinition } from "./agents.js";
import type {
  BridgeEvent,
  ChatCommand,
  ChatResult,
  StartTaskCommand,
} from "../contracts/protocol.js";
import type { AskUserInput } from "../tools/types.js";

export type RuntimeStartTaskCommand = StartTaskCommand;

export type RuntimeChatCommand = ChatCommand;

export type AgentRunResult = {
  text: string;
};

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
    command: RuntimeStartTaskCommand,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult>;
};

export type ChatRuntime = {
  readonly id: string;
  chat(
    command: RuntimeChatCommand,
    context: ChatRuntimeContext,
  ): Promise<ChatResult>;
};

export type BridgeAgent = BridgeAgentDefinition & {
  agent?: AgentRuntime;
  chat?: ChatRuntime;
};
