import {
  BridgeEventType,
} from "../../engine/agent/contracts/protocol.js";
import type { WriteBridgeJsonLine } from "../../engine/agent/commands/responses.js";
import type { EmitBridgeEvent } from "../../engine/agent/runtimes/types.js";
import { messageFromError } from "../../engine/agent/utils/error.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "../../session/index.js";
import {
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  type GetCollaborationTimelineCommand,
  type GetRuntimeSessionCommand,
  type ListRuntimeSessionsCommand,
} from "../../protocol/index.js";

type QueryCommand =
  | GetCollaborationTimelineCommand
  | GetRuntimeSessionCommand
  | ListRuntimeSessionsCommand;

type HandlerDeps = {
  emit: EmitBridgeEvent;
  writeJsonLine: WriteBridgeJsonLine;
};

export const handleSessionQueryCommand = async (
  command: QueryCommand,
  deps: HandlerDeps,
) => {
  try {
    switch (command.type) {
      case AgentRuntimeCommandType.ListRuntimeSessions:
        deps.writeJsonLine({
          type: AgentRuntimeResultType.RuntimeSessionsResult,
          requestId: command.requestId ?? null,
          sessions: await listRuntimeSessions({
            workspacePath: command.workspacePath,
            rootDir: command.rootDir,
            limit: command.limit,
            maxDepth: command.maxDepth,
          }),
        });
        return;

      case AgentRuntimeCommandType.GetRuntimeSession:
        deps.writeJsonLine({
          type: AgentRuntimeResultType.RuntimeSessionResult,
          requestId: command.requestId ?? null,
          ...(await getRuntimeSessionSnapshot(
            {
              workspacePath: command.workspacePath,
              sessionRootDir: command.sessionRootDir,
            },
            {
              includeLedger: command.includeLedger,
              includeTrace: command.includeTrace,
              includeTimeline: command.includeTimeline,
              timelineLimit: command.timelineLimit,
            },
          )),
        });
        return;

      case AgentRuntimeCommandType.GetCollaborationTimeline:
        {
          const timeline = await getCollaborationTimeline(
            {
              workspacePath: command.workspacePath,
              sessionRootDir: command.sessionRootDir,
            },
            {
              workflowRunId: command.workflowRunId,
              limit: command.limit,
            },
          );
          deps.writeJsonLine({
            type: AgentRuntimeResultType.CollaborationTimelineResult,
            requestId: command.requestId ?? null,
            ...timeline,
          });
        }
        return;
    }
  } catch (error: unknown) {
    deps.emit({
      type: BridgeEventType.Error,
      message: messageFromError(error),
    });
  }
};
