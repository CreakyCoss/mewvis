import type { AgentRuntime, LlmRuntime, RuntimeMode } from "../contracts/runtime.js";
import { resolveRuntime } from "../runtimes/index.js";
import type {
  AgentBridgeRunner,
  AgentBridgeRunnerResolution,
  BridgeRunnerResolution,
  LlmBridgeRunner,
  LlmBridgeRunnerResolution,
  RunnableBridgeCommand,
} from "./types.js";
import { BridgeCommandType, type ChatCommand, type StartTaskCommand } from "../contracts/protocol.js";

const toAgentRunner = (runtime: AgentRuntime): AgentBridgeRunner => async (command, context) => {
  return runtime.run(command, context);
};

const toLlmRunner = (runtime: LlmRuntime): LlmBridgeRunner => async (command, context) => {
  return runtime.chat(command, context);
};

const modeForCommand = (command: RunnableBridgeCommand): RuntimeMode => {
  if (command.type === BridgeCommandType.StartTask) {
    return "agent";
  }

  return "llm";
};

export function resolveBridgeRunner(command: StartTaskCommand): AgentBridgeRunnerResolution;
export function resolveBridgeRunner(command: ChatCommand): LlmBridgeRunnerResolution;
export function resolveBridgeRunner(
  command: RunnableBridgeCommand,
): BridgeRunnerResolution {
  const mode = modeForCommand(command);
  const resolution = resolveRuntime(mode, command.runtime);

  if (resolution.mode === "agent") {
    return {
      mode: resolution.mode,
      runtime: resolution.runtime,
      runner: toAgentRunner(resolution.implementation),
    };
  }

  return {
    mode: resolution.mode,
    runtime: resolution.runtime,
    runner: toLlmRunner(resolution.implementation),
  };
}
