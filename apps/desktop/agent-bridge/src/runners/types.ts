import {
  BridgeCommandType,
  type AgentRunResult,
  type BridgeCommand,
  type ChatCommand,
  type ChatResult,
  type StartTaskCommand,
} from "../contracts/protocol.js";
import type { AgentRuntimeContext, ChatRuntimeContext } from "../contracts/runtime.js";

export type RunnableBridgeCommand = StartTaskCommand | ChatCommand;

export type AgentBridgeRunner = (
  command: StartTaskCommand,
  context: AgentRuntimeContext,
) => Promise<AgentRunResult>;

export type ChatBridgeRunner = (
  command: ChatCommand,
  context: ChatRuntimeContext,
) => Promise<ChatResult>;

export type AgentBridgeRunnerResolution = {
  mode: "agent";
  runner: AgentBridgeRunner;
};

export type ChatBridgeRunnerResolution = {
  mode: "chat";
  runner: ChatBridgeRunner;
};

export type BridgeRunnerResolution = AgentBridgeRunnerResolution | ChatBridgeRunnerResolution;

export const isRunnableBridgeCommand = (command: BridgeCommand): command is RunnableBridgeCommand =>
  command.type === BridgeCommandType.StartTask || command.type === BridgeCommandType.Chat;
