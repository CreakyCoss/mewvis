import {
  BridgeEventType,
} from "./engine/agent/contracts/protocol.js";
import {
  messageFromError,
} from "./engine/agent/utils/error.js";
import type {
  CollaborationExecutorId,
} from "./engine/collaboration/index.js";
import {
  runAgentRuntimeStdio,
} from "./host/stdio-host.js";
import {
  writeBridgeEvent,
} from "./transport/stdio.js";

const resolveDefaultCollaborationExecutorIdFromEnv = (): CollaborationExecutorId | undefined => {
  const value =
    process.env.AGENT_RUNTIME_DEFAULT_COLLABORATION_EXECUTOR?.trim() ||
    process.env.AGENT_RUNTIME_COLLABORATION_EXECUTOR?.trim() ||
    "";
  return value ? value : undefined;
};

runAgentRuntimeStdio({
  defaultCollaborationExecutorId: resolveDefaultCollaborationExecutorIdFromEnv(),
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  writeBridgeEvent({
    type: BridgeEventType.Error,
    message: messageFromError(error),
  });
  process.exitCode = 1;
});
