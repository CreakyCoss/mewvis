import {
  BridgeEventType,
} from "../agent-engine/contracts/protocol.js";
import type {
  AgentRuntimeCommand,
} from "../protocol/index.js";
import {
  createStdioBridgeReader,
  parseAgentRuntimeCommand,
  writeBridgeEvent,
  writeJsonLine,
} from "../transport/stdio.js";
import {
  messageFromError,
} from "../agent-engine/utils/error.js";
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
  const reader = createStdioBridgeReader();
  const runtime = createAgentRuntime({
    ...options,
    close: () => {
      options.close?.();
      reader.close();
    },
    emit: writeBridgeEvent,
    writeJsonLine,
  });

  try {
    for await (const line of reader) {
      let command: AgentRuntimeCommand;
      try {
        command = parseAgentRuntimeCommand(line);
      } catch (error: unknown) {
        writeBridgeEvent({
          type: BridgeEventType.Error,
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

export const runAgentRuntimeStdioCli = (
  options: AgentRuntimeStdioOptions = {},
) => {
  runAgentRuntimeStdio(options).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    writeBridgeEvent({
      type: BridgeEventType.Error,
      message: messageFromError(error),
    });
    process.exitCode = 1;
  });
};
