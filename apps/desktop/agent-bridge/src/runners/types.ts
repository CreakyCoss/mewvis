import {
  BridgeCommandType,
  type AgentRunResult,
  type BridgeCommand,
  type ChatCommand,
  type ChatResult,
  type StartTaskCommand,
} from "../contracts/protocol.js";
import type { AgentRuntimeContext, LlmRuntimeContext } from "../contracts/runtime.js";

export type RunnableBridgeCommand = StartTaskCommand | ChatCommand;

export type AgentBridgeRunner = (
  command: StartTaskCommand,
  context: AgentRuntimeContext,
) => Promise<AgentRunResult>;

export type LlmBridgeRunner = (
  command: ChatCommand,
  context: LlmRuntimeContext,
) => Promise<ChatResult>;

export type AgentBridgeRunnerResolution = {
  mode: "agent";
  runtime: string;
  runner: AgentBridgeRunner;
};

export type LlmBridgeRunnerResolution = {
  mode: "llm";
  runtime: string;
  runner: LlmBridgeRunner;
};

export type BridgeRunnerResolution = AgentBridgeRunnerResolution | LlmBridgeRunnerResolution;

export const isRunnableBridgeCommand = (command: BridgeCommand): command is RunnableBridgeCommand =>
  command.type === BridgeCommandType.StartTask || command.type === BridgeCommandType.Chat;
