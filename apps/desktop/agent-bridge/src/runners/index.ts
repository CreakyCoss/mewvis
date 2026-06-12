import {
  BridgeCommandType,
  type ChatCommand,
  type StartTaskCommand,
} from "../contracts/protocol.js";
import { resolveRuntime } from "../runtimes/index.js";
import type {
  AgentBridgeRunner,
  BridgeRunner,
  ChatBridgeRunner,
  RunnableBridgeCommand,
} from "./types.js";

const resolveAgentRunner = (command: StartTaskCommand): AgentBridgeRunner => {
  const { implementation } = resolveRuntime("agent", command.agentId);
  return (runtimeCommand, context) => implementation.run(runtimeCommand, context);
};

const resolveChatRunner = (command: ChatCommand): ChatBridgeRunner => {
  const { implementation } = resolveRuntime("chat", command.agentId);
  return (runtimeCommand, context) => implementation.chat(runtimeCommand, context);
};

export function resolveBridgeRunner(command: StartTaskCommand): AgentBridgeRunner;
export function resolveBridgeRunner(command: ChatCommand): ChatBridgeRunner;
export function resolveBridgeRunner(command: RunnableBridgeCommand): BridgeRunner;
export function resolveBridgeRunner(command: RunnableBridgeCommand): BridgeRunner {
  switch (command.type) {
    case BridgeCommandType.StartTask:
      return resolveAgentRunner(command);
    case BridgeCommandType.Chat:
      return resolveChatRunner(command);
  }
}
