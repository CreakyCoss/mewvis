import type { AgentCommand as InternalAgentCommand } from "./agent/contracts/index.js";
import {
  AgentEventType as InternalAgentEventType,
} from "./agent/contracts/events.js";
import type { WriteAgentRuntimeJsonLine } from "./agent/commands/responses.js";
import { createAgentCommandRouter } from "./agent/commands/router.js";
import { createAgentEngine } from "./agent/index.js";
import type {
  AgentRuntimeCallbacks,
  EmitAgentEvent,
} from "./agent/runtimes/types.js";
import {
  createCollaborationEngine,
} from "./collaboration/index.js";
import type {
  CollaborationRunInput as InternalCollaborationRunInput,
} from "./collaboration/contracts/workflow.js";
import type {
  CollaborationModeRunInput as InternalCollaborationModeRunInput,
} from "./collaboration/modes/contracts.js";
import type { RunAgentForCollaboration } from "./collaboration/contracts/executor.js";
import {
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "./session/index.js";
import { messageFromError } from "./error.js";
import {
  AgentRuntimeCommandType,
  type AgentRuntimeCommand,
  type GetCollaborationTimelineCommand,
  type GetRuntimeSessionCommand,
  type ListRuntimeSessionsCommand,
  type RunCollaborationCommand,
  type RunCollaborationModeCommand,
} from "../protocol/command.js";
import {
  AgentRuntimeResultType,
} from "../protocol/result.js";

export {
  AgentCommandType,
  AgentEventType,
} from "./agent/contracts/index.js";

export type {
  AgentCommand,
  AgentDefinitionsResult,
  ChatResult,
  PongResult,
  RuntimeAgentCapability,
  RuntimeAgentDefinition,
  RuntimeApiFormat,
  RuntimeModelInput,
  RuntimeThinkingLevel,
  ShutdownAckResult,
  TaskResult,
} from "./agent/contracts/index.js";

export type { AskUserInput } from "./agent/tools/types.js";

export type {
  CollaborationRunInput,
  CollaborationRunResult,
} from "./collaboration/contracts/index.js";

export type {
  CollaborationModeRunInput,
  CollaborationModeSummary,
} from "./collaboration/modes/contracts.js";

export type RuntimeEngineOptions = {
  callbacks?: Partial<AgentRuntimeCallbacks>;
  close?: () => void;
  emit?: EmitAgentEvent;
  writeJsonLine?: WriteAgentRuntimeJsonLine;
};

type QueryCommand =
  | GetCollaborationTimelineCommand
  | GetRuntimeSessionCommand
  | ListRuntimeSessionsCommand;

type RunCommand = RunCollaborationCommand | RunCollaborationModeCommand;

const collaborationBusyMessage = "当前 Agent runtime 已有运行中的协作任务，无法启动新协作";

export const createRuntimeEngine = ({
  callbacks,
  close = () => undefined,
  emit = () => undefined,
  writeJsonLine = () => undefined,
}: RuntimeEngineOptions = {}) => {
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
    runAgent: runAgentForCollaboration,
  });
  let activeCollaborationRun: Promise<void> | null = null;

  const listCollaborationModes = (command: { requestId?: string | null }) => {
    writeJsonLine({
      type: AgentRuntimeResultType.CollaborationModesResult,
      requestId: command.requestId ?? null,
      modes: collaborationEngine.listModes(),
    });
  };

  const handleSessionQueryCommand = async (command: QueryCommand) => {
    try {
      switch (command.type) {
        case AgentRuntimeCommandType.ListRuntimeSessions:
          writeJsonLine({
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
          writeJsonLine({
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
            writeJsonLine({
              type: AgentRuntimeResultType.CollaborationTimelineResult,
              requestId: command.requestId ?? null,
              ...timeline,
            });
          }
          return;
      }
    } catch (error: unknown) {
      emit({
        type: InternalAgentEventType.Error,
        message: messageFromError(error),
      });
    }
  };

  const taskIdFor = (command: RunCommand) =>
    command.requestId?.trim() || command.input.requestId?.trim() || "";

  const writeCollaborationBusyResult = (command: RunCommand) => {
    emit({
      type: InternalAgentEventType.Error,
      message: collaborationBusyMessage,
    });
    writeJsonLine({
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: command.requestId ?? null,
      workflowRunId: "",
      steps: [],
      success: false,
      message: collaborationBusyMessage,
    });
    writeJsonLine({
      type: "task_result",
      requestId: command.requestId ?? null,
      taskId: taskIdFor(command),
      success: false,
      message: collaborationBusyMessage,
    });
  };

  const runCollaborationCommand = (command: RunCommand) => {
    if (activeCollaborationRun) {
      writeCollaborationBusyResult(command);
      return;
    }

    const runContext = {
      emit: writeJsonLine,
    };
    const run = command.type === AgentRuntimeCommandType.RunCollaborationMode
      ? collaborationEngine.runMode(
          {
            ...command.input,
            requestId: command.input.requestId ?? command.requestId ?? null,
          } as InternalCollaborationModeRunInput,
          runContext,
        )
      : collaborationEngine.run(
          {
            ...command.input,
            requestId: command.input.requestId ?? command.requestId ?? null,
          } as InternalCollaborationRunInput,
          runContext,
        );

    activeCollaborationRun = run.then((result) => {
      writeJsonLine({
        type: AgentRuntimeResultType.CollaborationResult,
        requestId: command.requestId ?? null,
        ...result,
      });
      writeJsonLine({
        type: "task_result",
        requestId: command.requestId ?? null,
        taskId: taskIdFor(command),
        success: true,
      });
    }).catch((error: unknown) => {
      const message = messageFromError(error);
      emit({
        type: InternalAgentEventType.Error,
        taskId: taskIdFor(command) || undefined,
        message,
      });
      writeJsonLine({
        type: "task_result",
        requestId: command.requestId ?? null,
        taskId: taskIdFor(command),
        success: false,
        message,
      });
    }).finally(() => {
      activeCollaborationRun = null;
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
        await handleSessionQueryCommand(command);
        return true;

      case AgentRuntimeCommandType.RunCollaboration:
      case AgentRuntimeCommandType.RunCollaborationMode:
        runCollaborationCommand(command);
        return true;

      default:
        return agentCommandRouter.handle(command as InternalAgentCommand);
    }
  };

  const waitForRunningTask = async () => {
    await agentCommandRouter.waitForRunningTask();
    if (activeCollaborationRun) {
      await activeCollaborationRun.catch(() => undefined);
    }
  };

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
    handle,
    waitForRunningTask,
  };
};

export type RuntimeEngine = ReturnType<typeof createRuntimeEngine>;
