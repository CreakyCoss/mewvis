import type { ExtensionSource } from "@isle/extension-host";
import { createExtensionRuntime } from "../../../../extensions/index.js";
import {
  executeAgentRunCommand,
  executeChatCommand,
  type AgentExecutionOptions,
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
  dispose(): Promise<void>;
  runAgent(
    command: AgentRunCommand,
    context: AgentRuntimeContext,
  ): Promise<AgentRunResult>;
  chat(
    command: ChatRunCommand,
    context: ChatRuntimeContext,
  ): Promise<ChatRunResult>;
};

/** Engine configuration resolves plugins once at the start of each Agent run. */
export type AgentEngineOptions = Omit<AgentExecutionOptions, "extensions"> & {
  getExtensionSources?: () => readonly ExtensionSource[];
};

export const createAgentEngine = ({
  getExtensionSources = () => [],
  extensionRuntime = createExtensionRuntime(),
  ...options
}: AgentEngineOptions = {}): AgentEngine => ({
  dispose: () => extensionRuntime.dispose(),
  runAgent: async (command, context) =>
    executeAgentRunCommand(command, context, {
      ...options,
      extensionRuntime,
      extensions: extensionRuntime.snapshotSources(getExtensionSources()),
    }),
  chat: (command, context) => executeChatCommand(command, context, options),
});
