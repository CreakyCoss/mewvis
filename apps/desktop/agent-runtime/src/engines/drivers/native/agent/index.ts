import {
  executeAgentRunCommand,
  executeChatCommand,
  type AgentEngineOptions,
} from "./commands/execution.js";
import type {
  AgentRunCommand,
  AgentRunResult,
  AgentRuntimeContext,
  ChatRunCommand,
  ChatRunResult,
  ChatRuntimeContext,
} from "./runtimes/types.js";

export type AgentEngine = {
  runAgent(
    command: AgentRunCommand,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult>;
  chat(
    command: ChatRunCommand,
    context: ChatRuntimeContext,
  ): Promise<ChatRunResult>;
};

export const createAgentEngine = (options: AgentEngineOptions = {}): AgentEngine => ({
  runAgent: (command, context) =>
    executeAgentRunCommand(command, context, options),
  chat: (command, context) =>
    executeChatCommand(command, context, options),
});
