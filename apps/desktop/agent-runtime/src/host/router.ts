import {
  BridgeEventType,
  BridgeTaskCommandType,
  type BridgeCommand,
} from "../agent-engine/contracts/protocol.js";
import type { WriteBridgeJsonLine } from "../agent-engine/commands/responses.js";
import { createBridgeCommandRouter } from "../agent-engine/commands/router.js";
import { createBridgeQuestionManager } from "../agent-engine/commands/questions.js";
import type { EmitBridgeEvent } from "../agent-engine/runtimes/types.js";
import { messageFromError } from "../agent-engine/utils/error.js";
import type { CollaborationEngine } from "../collaboration-engine/index.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "../runtime-session/index.js";
import {
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  type AgentRuntimeCommand,
  type GetCollaborationTimelineCommand,
  type GetRuntimeSessionCommand,
  type ListCollaborationModesCommand,
  type ListRuntimeSessionsCommand,
  type RunCollaborationCommand,
  type RunCollaborationModeCommand,
} from "../protocol/index.js";

type AgentRuntimeRouterDeps = {
  close: () => void;
  emit: EmitBridgeEvent;
  writeJsonLine: WriteBridgeJsonLine;
  collaborationEngine: CollaborationEngine;
};

const runningCollaborationMessage = "当前 Agent runtime 已有运行中的协作任务，无法启动新协作";

type CollaborationTaskCommand = RunCollaborationCommand | RunCollaborationModeCommand;

const collaborationTaskId = (command: CollaborationTaskCommand) =>
  command.requestId?.trim() || command.input.requestId?.trim() || "";

const isRunCollaborationCommand = (
  command: AgentRuntimeCommand,
): command is RunCollaborationCommand =>
  command.type === AgentRuntimeCommandType.RunCollaboration;

const isRunCollaborationModeCommand = (
  command: AgentRuntimeCommand,
): command is RunCollaborationModeCommand =>
  command.type === AgentRuntimeCommandType.RunCollaborationMode;

const isListCollaborationModesCommand = (
  command: AgentRuntimeCommand,
): command is ListCollaborationModesCommand =>
  command.type === AgentRuntimeCommandType.ListCollaborationModes;

const isListRuntimeSessionsCommand = (
  command: AgentRuntimeCommand,
): command is ListRuntimeSessionsCommand =>
  command.type === AgentRuntimeCommandType.ListRuntimeSessions;

const isGetRuntimeSessionCommand = (
  command: AgentRuntimeCommand,
): command is GetRuntimeSessionCommand =>
  command.type === AgentRuntimeCommandType.GetRuntimeSession;

const isGetCollaborationTimelineCommand = (
  command: AgentRuntimeCommand,
): command is GetCollaborationTimelineCommand =>
  command.type === AgentRuntimeCommandType.GetCollaborationTimeline;

const isRuntimeSessionQueryCommand = (
  command: AgentRuntimeCommand,
): command is
  | GetCollaborationTimelineCommand
  | GetRuntimeSessionCommand
  | ListRuntimeSessionsCommand =>
  isListRuntimeSessionsCommand(command) ||
  isGetRuntimeSessionCommand(command) ||
  isGetCollaborationTimelineCommand(command);

const isCollaborationTaskCommand = (
  command: AgentRuntimeCommand,
): command is CollaborationTaskCommand =>
  isRunCollaborationCommand(command) || isRunCollaborationModeCommand(command);

const isBridgeCommand = (command: AgentRuntimeCommand): command is BridgeCommand =>
  !isCollaborationTaskCommand(command) &&
  !isListCollaborationModesCommand(command) &&
  !isRuntimeSessionQueryCommand(command);

export const createAgentRuntimeRouter = (deps: AgentRuntimeRouterDeps) => {
  let runningCollaboration: Promise<void> | null = null;
  const bridgeRouter = createBridgeCommandRouter(deps);
  const collaborationQuestions = createBridgeQuestionManager(deps.emit);

  const listCollaborationModes = (command: ListCollaborationModesCommand) => {
    deps.writeJsonLine({
      type: AgentRuntimeResultType.CollaborationModesResult,
      requestId: command.requestId ?? null,
      modes: deps.collaborationEngine.listModes(),
    });
  };

  const handleRuntimeSessionQuery = async (
    command:
      | GetCollaborationTimelineCommand
      | GetRuntimeSessionCommand
      | ListRuntimeSessionsCommand,
  ) => {
    try {
      if (isListRuntimeSessionsCommand(command)) {
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
      }

      if (isGetRuntimeSessionCommand(command)) {
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
      }

      const result = await getCollaborationTimeline(
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
        ...result,
      });
    } catch (error: unknown) {
      deps.emit({
        type: BridgeEventType.Error,
        message: messageFromError(error),
      });
    }
  };

  const runCollaboration = (command: CollaborationTaskCommand) => {
    if (runningCollaboration) {
      deps.emit({
        type: BridgeEventType.Error,
        message: runningCollaborationMessage,
      });
      deps.writeJsonLine({
        type: AgentRuntimeResultType.CollaborationResult,
        requestId: command.requestId ?? null,
        workflowRunId: "",
        steps: [],
        success: false,
        message: runningCollaborationMessage,
      });
      deps.writeJsonLine({
        type: "task_result",
        requestId: command.requestId ?? null,
        taskId: collaborationTaskId(command),
        success: false,
        message: runningCollaborationMessage,
      });
      return;
    }

    const run = isRunCollaborationModeCommand(command)
      ? deps.collaborationEngine.runMode(
          {
            ...command.input,
            requestId: command.input.requestId ?? command.requestId ?? null,
          },
          {
            askUser: collaborationQuestions.askUser,
            emit: deps.writeJsonLine,
          },
        )
      : deps.collaborationEngine.run(
          {
            ...command.input,
            requestId: command.input.requestId ?? command.requestId ?? null,
          },
          {
            askUser: collaborationQuestions.askUser,
            emit: deps.writeJsonLine,
          },
        );

    runningCollaboration = run.then((result) => {
      deps.writeJsonLine({
        type: AgentRuntimeResultType.CollaborationResult,
        requestId: command.requestId ?? null,
        ...result,
      });
      deps.writeJsonLine({
        type: "task_result",
        requestId: command.requestId ?? null,
        taskId: collaborationTaskId(command),
        success: true,
      });
    }).catch((error: unknown) => {
      const message = messageFromError(error);
      deps.emit({
        type: BridgeEventType.Error,
        taskId: collaborationTaskId(command) || undefined,
        message,
      });
      deps.writeJsonLine({
        type: "task_result",
        requestId: command.requestId ?? null,
        taskId: collaborationTaskId(command),
        success: false,
        message,
      });
    }).finally(() => {
      runningCollaboration = null;
    });
  };

  const handle = async (command: AgentRuntimeCommand): Promise<boolean> => {
    if (isListCollaborationModesCommand(command)) {
      listCollaborationModes(command);
      return true;
    }

    if (isRuntimeSessionQueryCommand(command)) {
      await handleRuntimeSessionQuery(command);
      return true;
    }

    if (isCollaborationTaskCommand(command)) {
      runCollaboration(command);
      return true;
    }

    if (command.type === BridgeTaskCommandType.AnswerQuestion) {
      collaborationQuestions.handleAnswer(command);
    }

    if (isBridgeCommand(command)) {
      return bridgeRouter.handle(command);
    }

    return true;
  };

  const waitForRunningTask = async () => {
    await bridgeRouter.waitForRunningTask();
    if (runningCollaboration) {
      await runningCollaboration.catch(() => undefined);
    }
  };

  return {
    handle,
    waitForRunningTask,
  };
};
