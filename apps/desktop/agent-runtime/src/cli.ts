import {
  BridgeEventType,
} from "./agent-engine/contracts/protocol.js";
import type { AgentRuntimeCommand } from "./protocol/index.js";
import { createAgentRuntime } from "./index.js";
import {
  createStdioBridgeReader,
  parseAgentRuntimeCommand,
  writeBridgeEvent,
  writeJsonLine,
} from "./transport/stdio.js";
import { messageFromError } from "./agent-engine/utils/error.js";

const main = async () => {
  const reader = createStdioBridgeReader();
  const runtime = createAgentRuntime({
    close: () => reader.close(),
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  writeBridgeEvent({
    type: BridgeEventType.Error,
    message: messageFromError(error),
  });
  process.exitCode = 1;
});
