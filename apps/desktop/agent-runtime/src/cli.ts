import { AgentEventType } from "./engine/agent/contracts/protocol.js";
import { messageFromError } from "./engine/agent/utils/error.js";
import { runAgentRuntimeStdio } from "./host/stdio-host.js";
import { writeAgentEvent } from "./transport/stdio.js";

runAgentRuntimeStdio().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  writeAgentEvent({
    type: AgentEventType.Error,
    message: messageFromError(error),
  });
  process.exitCode = 1;
});
