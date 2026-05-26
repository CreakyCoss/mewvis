import type { AgentRuntime, LlmRuntime, RuntimeMode } from "../contracts/runtime.js";
import { resolveRuntime } from "../runtimes/index.js";
import type { BridgeRunner, BridgeRunnerResolution, RunnableBridgeCommand } from "./types.js";

const toAgentRunner = (runtime: AgentRuntime): BridgeRunner => async (command, context) => {
  if (command.type !== "start_task") {
    throw new Error(`Agent runtime 不支持命令：${command.type}`);
  }

  return runtime.run(command, context);
};

const toLlmRunner = (runtime: LlmRuntime): BridgeRunner => async (command, context) => {
  if (command.type !== "chat") {
    throw new Error(`LLM runtime 不支持命令：${command.type}`);
  }

  return runtime.chat(command, context);
};

const modeForCommand = (command: RunnableBridgeCommand): RuntimeMode => {
  if (command.type === "start_task") {
    return "agent";
  }

  return "llm";
};

export const resolveBridgeRunner = (
  command: RunnableBridgeCommand,
): BridgeRunnerResolution => {
  const mode = modeForCommand(command);
  const resolution = resolveRuntime(mode, command.runtime);
  const runner = resolution.mode === "agent"
    ? toAgentRunner(resolution.implementation)
    : toLlmRunner(resolution.implementation);

  return {
    mode,
    runtime: resolution.runtime,
    runner,
  };
};
