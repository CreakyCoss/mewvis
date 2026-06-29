import type { BridgeEvent } from "../engine/agent/contracts/protocol.js";
import type { WriteBridgeJsonLine } from "../engine/agent/commands/responses.js";
import { createAgentEngine } from "../engine/agent/index.js";
import {
  createCollaborationEngine,
  type CollaborationExecutorId,
} from "../engine/collaboration/index.js";
import { createAgentRuntimeRouter } from "./router.js";

export type AgentRuntimeHostOptions = {
  close?: () => void;
  defaultCollaborationExecutorId?: CollaborationExecutorId | null;
  emit?: (event: BridgeEvent) => void;
  writeJsonLine?: WriteBridgeJsonLine;
};

export const createAgentRuntime = ({
  close = () => undefined,
  defaultCollaborationExecutorId,
  emit = () => undefined,
  writeJsonLine = () => undefined,
}: AgentRuntimeHostOptions = {}) => {
  const agentEngine = createAgentEngine();
  const collaborationEngine = createCollaborationEngine({
    defaultExecutorId: defaultCollaborationExecutorId?.trim() || undefined,
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
    listCollaborationModes: collaborationEngine.listModes,
    runCollaboration: collaborationEngine.run,
    runCollaborationMode: collaborationEngine.runMode,
    runAgent: agentEngine.runAgent,
    waitForRunningTask: router.waitForRunningTask,
  };
};

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;
