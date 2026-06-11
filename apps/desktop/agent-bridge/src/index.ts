import { createBridgeCommandRouter } from "./router.js";
import {
  BridgeEventType,
  type BridgeCommand,
} from "./contracts/protocol.js";
import { createBridgeQuestionManager } from "./session/questions.js";
import {
  createStdioBridgeReader,
  parseBridgeCommand,
  writeBridgeEvent,
  writeJsonLine,
} from "./transport/stdio.js";

const messageFromError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const main = async () => {
  const reader = createStdioBridgeReader();
  const questions = createBridgeQuestionManager(writeBridgeEvent);
  const router = createBridgeCommandRouter({
    close: () => reader.close(),
    emit: writeBridgeEvent,
    questions,
    writeJsonLine,
  });

  try {
    for await (const line of reader) {
      let command: BridgeCommand;
      try {
        command = parseBridgeCommand(line);
      } catch (error: unknown) {
        writeBridgeEvent({
          type: BridgeEventType.Error,
          message: messageFromError(error),
        });
        continue;
      }

      const keepRunning = await router.handle(command);
      if (!keepRunning) {
        break;
      }
    }
  } finally {
    await router.waitForRunningTask();
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
