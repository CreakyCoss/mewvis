import type { WriteBridgeJsonLine } from "../../engine/agent/commands/responses.js";
import type { AgentCommandRouter } from "../../engine/agent/commands/router.js";
import type { EmitBridgeEvent } from "../../engine/agent/runtimes/types.js";
import type { CollaborationEngine } from "../../engine/collaboration/index.js";
import {
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  type AgentRuntimeCommand,
  type ListCollaborationModesCommand,
} from "../../protocol/index.js";
import { createCollaborationCommandRunner } from "./collaboration.js";
import { handleSessionQueryCommand } from "./sessions.js";

type RuntimeRouterDeps = {
  emit: EmitBridgeEvent;
  writeJsonLine: WriteBridgeJsonLine;
  collaborationEngine: CollaborationEngine;
  agentCommandRouter: AgentCommandRouter;
};

export const createRuntimeRouter = (deps: RuntimeRouterDeps) => {
  const collaborationRunner = createCollaborationCommandRunner(deps);

  const listCollaborationModes = (command: ListCollaborationModesCommand) => {
    deps.writeJsonLine({
      type: AgentRuntimeResultType.CollaborationModesResult,
      requestId: command.requestId ?? null,
      modes: deps.collaborationEngine.listModes(),
    });
  };

  const handle = async (command: AgentRuntimeCommand): Promise<boolean> => {
    switch (command.type) {
      case AgentRuntimeCommandType.ListCollaborationModes:
        listCollaborationModes(command);
        return true;

      case AgentRuntimeCommandType.ListRuntimeSessions:
      case AgentRuntimeCommandType.GetRuntimeSession:
      case AgentRuntimeCommandType.GetCollaborationTimeline:
        await handleSessionQueryCommand(command, deps);
        return true;

      case AgentRuntimeCommandType.RunCollaboration:
      case AgentRuntimeCommandType.RunCollaborationMode:
        collaborationRunner.run(command);
        return true;

      default:
        return deps.agentCommandRouter.handle(command);
    }
  };

  const waitForRunningTask = async () => {
    await deps.agentCommandRouter.waitForRunningTask();
    await collaborationRunner.waitForRunningTask();
  };

  return {
    handle,
    waitForRunningTask,
  };
};
