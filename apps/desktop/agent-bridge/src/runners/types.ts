import type { AgentRunResult, BridgeCommand, ChatCommand, ChatResult, StartTaskCommand } from "../contracts/protocol.js";
import type { AgentRuntimeContext, RuntimeMode } from "../contracts/runtime.js";

export type RunnableBridgeCommand = StartTaskCommand | ChatCommand;
export type BridgeRuntimeResult = AgentRunResult | ChatResult;

export type BridgeRunner = (
  command: RunnableBridgeCommand,
  context: AgentRuntimeContext,
) => Promise<BridgeRuntimeResult>;

export type BridgeRunnerResolution = {
  mode: RuntimeMode;
  runtime: string;
  runner: BridgeRunner;
};

export const isRunnableBridgeCommand = (command: BridgeCommand): command is RunnableBridgeCommand =>
  command.type === "start_task" || command.type === "chat";
