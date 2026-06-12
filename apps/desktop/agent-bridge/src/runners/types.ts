import type {
  ChatCommand,
  ChatResult,
  StartTaskCommand,
} from "../contracts/protocol.js";
import type {
  AgentRunResult,
  AgentRuntimeContext,
  ChatRuntimeContext,
} from "../runtimes/types.js";

export type RunnableBridgeCommand = StartTaskCommand | ChatCommand;

export type AgentBridgeRunner = (
  command: StartTaskCommand,
  context: AgentRuntimeContext,
) => Promise<AgentRunResult>;

export type ChatBridgeRunner = (
  command: ChatCommand,
  context: ChatRuntimeContext,
) => Promise<ChatResult>;

export type BridgeRunner = AgentBridgeRunner | ChatBridgeRunner;
