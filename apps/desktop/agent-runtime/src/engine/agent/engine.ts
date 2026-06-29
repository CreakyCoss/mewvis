import type { ChatResult } from "./contracts/protocol.js";
import {
  executeAgentRunCommand,
  executeChatCommand,
} from "./commands/execution.js";
import type {
  AgentRunCommand,
  AgentRunResult,
  AgentRuntimeContext,
  ChatRuntimeContext,
  RuntimeChatCommand,
} from "./runtimes/types.js";

export type AgentEngine = {
  runAgent(
    command: AgentRunCommand,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult>;
  chat(
    command: RuntimeChatCommand,
    context: ChatRuntimeContext,
  ): Promise<ChatResult>;
};

export const createAgentEngine = (): AgentEngine => ({
  runAgent: executeAgentRunCommand,
  chat: executeChatCommand,
});
