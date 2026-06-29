import {
  AgentEventType,
} from "../engine/agent/contracts/protocol.js";
import type {
  AgentRuntimeCommand,
} from "../protocol/index.js";
import {
  createStdioRuntimeReader,
  parseAgentRuntimeCommand,
  writeAgentEvent,
  writeJsonLine,
} from "../transport/stdio.js";
import {
  messageFromError,
} from "../engine/agent/utils/error.js";
import {
  createAgentRuntime,
  type AgentRuntimeHostOptions,
} from "./runtime.js";

export type AgentRuntimeStdioOptions = Omit<
  AgentRuntimeHostOptions,
  "close" | "emit" | "writeJsonLine"
> & {
  close?: () => void;
};

export const runAgentRuntimeStdio = async (
  options: AgentRuntimeStdioOptions = {},
) => {
  const reader = createStdioRuntimeReader();
  const runtime = createAgentRuntime({
    ...options,
    close: () => {
      options.close?.();
      reader.close();
    },
    emit: writeAgentEvent,
    writeJsonLine,
  });

  try {
    for await (const line of reader) {
      let command: AgentRuntimeCommand;
      try {
        command = parseAgentRuntimeCommand(line);
      } catch (error: unknown) {
        writeAgentEvent({
          type: AgentEventType.Error,
          message: messageFromError(error),
        });
        continue;
      }

      const keepRunning = await runtime.handle(command);
      if (!keepRunning) {
        break;
      }
    }
  } finally {
    await runtime.waitForRunningTask();
  }
};
