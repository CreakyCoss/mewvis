import type { BridgeEvent } from "../engine/agent/contracts/protocol.js";
import type { WriteBridgeJsonLine } from "../engine/agent/commands/responses.js";
import { createAgentCommandRouter } from "../engine/agent/commands/router.js";
import { createAgentEngine } from "../engine/agent/index.js";
import type { AgentRuntimeCallbacks } from "../engine/agent/runtimes/types.js";
import {
  createCollaborationEngine,
  type CollaborationExecutorId,
} from "../engine/collaboration/index.js";
import type { RunAgentForCollaboration } from "../engine/collaboration/contracts/index.js";
import { createRuntimeRouter } from "./router/index.js";

export type AgentRuntimeHostOptions = {
  callbacks?: Partial<AgentRuntimeCallbacks>;
  close?: () => void;
  defaultCollaborationExecutorId?: CollaborationExecutorId | null;
  emit?: (event: BridgeEvent) => void;
  writeJsonLine?: WriteBridgeJsonLine;
};

export const createAgentRuntime = ({
  callbacks,
  close = () => undefined,
  defaultCollaborationExecutorId,
  emit = () => undefined,
  writeJsonLine = () => undefined,
}: AgentRuntimeHostOptions = {}) => {
  const agentEngine = createAgentEngine();
  const agentCommandRouter = createAgentCommandRouter({
    callbacks,
    close,
    emit,
    writeJsonLine,
  });
  const runAgentForCollaboration: RunAgentForCollaboration = (command, context) =>
    agentEngine.runAgent(command, {
      callbacks: agentCommandRouter.callbacks,
      emit: context.emit,
    });
  const collaborationEngine = createCollaborationEngine({
    defaultExecutorId: defaultCollaborationExecutorId?.trim() || undefined,
    runAgent: runAgentForCollaboration,
  });
  const router = createRuntimeRouter({
    agentCommandRouter,
    collaborationEngine,
    emit,
    writeJsonLine,
  });

  return {
    agent: {
      chat: agentEngine.chat,
      run: agentEngine.runAgent,
    },
    collaboration: {
      listModes: collaborationEngine.listModes,
      run: collaborationEngine.run,
      runMode: collaborationEngine.runMode,
    },
    handle: router.handle,
    waitForRunningTask: router.waitForRunningTask,
  };
};

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;
