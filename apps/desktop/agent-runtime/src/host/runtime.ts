import type { BridgeEvent } from "../agent-engine/contracts/protocol.js";
import type { WriteBridgeJsonLine } from "../agent-engine/commands/responses.js";
import { createAgentEngine } from "../agent-engine/index.js";
import {
  createCollaborationEngine,
  type CollaborationExecutorId,
  type CollaborationExtension,
} from "../collaboration-engine/index.js";
import { createAgentRuntimeRouter } from "./router.js";

export type AgentRuntimeHostOptions = {
  close?: () => void;
  collaborationExtensions?: readonly CollaborationExtension[];
  defaultCollaborationExecutorId?: CollaborationExecutorId | null;
  emit?: (event: BridgeEvent) => void;
  writeJsonLine?: WriteBridgeJsonLine;
};

export const createAgentRuntime = ({
  close = () => undefined,
  collaborationExtensions = [],
  defaultCollaborationExecutorId,
  emit = () => undefined,
  writeJsonLine = () => undefined,
}: AgentRuntimeHostOptions = {}) => {
  const agentEngine = createAgentEngine();
  const collaborationEngine = createCollaborationEngine({
    defaultExecutorId: resolveDefaultCollaborationExecutorId(defaultCollaborationExecutorId),
    extensions: collaborationExtensions,
    runAgent: agentEngine.runAgent,
  });
  const router = createAgentRuntimeRouter({
    collaborationEngine,
    close,
    emit,
    writeJsonLine,
  });

  return {
    chat: agentEngine.chat,
    handle: router.handle,
    runCollaboration: collaborationEngine.run,
    runAgent: agentEngine.runAgent,
    waitForRunningTask: router.waitForRunningTask,
  };
};

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;

const resolveDefaultCollaborationExecutorId = (
  explicit: CollaborationExecutorId | null | undefined,
): CollaborationExecutorId | undefined => {
  const explicitValue = typeof explicit === "string" ? explicit.trim() : "";
  if (explicitValue) {
    return explicitValue;
  }

  const envValue =
    process.env.AGENT_RUNTIME_DEFAULT_COLLABORATION_EXECUTOR?.trim() ||
    process.env.AGENT_RUNTIME_COLLABORATION_EXECUTOR?.trim() ||
    "";
  return envValue || undefined;
};
