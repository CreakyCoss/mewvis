import type { RuntimeChatResult } from "./contracts/chat.js";
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
  ): Promise<RuntimeChatResult>;
};

export const createAgentEngine = (): AgentEngine => ({
  runAgent: executeAgentRunCommand,
  chat: executeChatCommand,
});
