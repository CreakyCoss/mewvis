import type { AgentRuntime, ChatRuntime, RuntimeMode } from "../contracts/runtime.js";
import { resolveRuntime } from "../runtimes/index.js";
import type {
  AgentBridgeRunner,
  AgentBridgeRunnerResolution,
  BridgeRunnerResolution,
  ChatBridgeRunner,
  ChatBridgeRunnerResolution,
  RunnableBridgeCommand,
} from "./types.js";
import {
  BridgeCommandType,
  type ChatCommand,
  type StartTaskCommand,
} from "../contracts/protocol.js";

const toAgentRunner = (runtime: AgentRuntime): AgentBridgeRunner => async (command, context) => {
  return runtime.run(command, context);
};

const toChatRunner = (runtime: ChatRuntime): ChatBridgeRunner => async (command, context) => {
  return runtime.chat(command, context);
};

const modeForCommand = (command: RunnableBridgeCommand): RuntimeMode => {
  if (command.type === BridgeCommandType.StartTask) {
    return "agent";
  }

  return "chat";
};

export function resolveBridgeRunner(command: StartTaskCommand): AgentBridgeRunnerResolution;
export function resolveBridgeRunner(command: ChatCommand): ChatBridgeRunnerResolution;
export function resolveBridgeRunner(
  command: RunnableBridgeCommand,
): BridgeRunnerResolution {
  const mode = modeForCommand(command);
  const resolution = resolveRuntime(mode, command.agentId);

  if (resolution.mode === "agent") {
    return {
      mode: resolution.mode,
      runner: toAgentRunner(resolution.implementation),
    };
  }

  return {
    mode: resolution.mode,
    runner: toChatRunner(resolution.implementation),
  };
}
