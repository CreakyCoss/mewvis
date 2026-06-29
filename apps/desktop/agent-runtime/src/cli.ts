import { BridgeEventType } from "./engine/agent/contracts/protocol.js";
import { messageFromError } from "./engine/agent/utils/error.js";
import { runAgentRuntimeStdio } from "./host/stdio-host.js";
import { writeBridgeEvent } from "./transport/stdio.js";

runAgentRuntimeStdio().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  writeBridgeEvent({
    type: BridgeEventType.Error,
    message: messageFromError(error),
  });
  process.exitCode = 1;
});
