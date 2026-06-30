import {
  executeAgentRunCommand,
  executeChatCommand,
} from "./commands/execution.js";
import type {
  AgentRunCommand,
  AgentRunResult,
  AgentRuntimeContext,
  ChatRunResult,
  ChatRuntimeContext,
  ChatRunCommand,
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

export const createAgentEngine = (): AgentEngine => ({
  runAgent: executeAgentRunCommand,
  chat: executeChatCommand,
});
