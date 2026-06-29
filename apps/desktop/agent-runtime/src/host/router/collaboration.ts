import {
  AgentEventType,
} from "../../engine/agent/contracts/events.js";
import type { WriteAgentRuntimeJsonLine } from "../../engine/agent/commands/responses.js";
import type { EmitAgentEvent } from "../../engine/agent/runtimes/types.js";
import type { CollaborationEngine } from "../../engine/collaboration/index.js";
import { messageFromError } from "../../engine/agent/utils/error.js";
import {
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  type RunCollaborationCommand,
  type RunCollaborationModeCommand,
} from "../../protocol/index.js";

type RunCommand = RunCollaborationCommand | RunCollaborationModeCommand;

type RunnerDeps = {
  collaborationEngine: CollaborationEngine;
  emit: EmitAgentEvent;
  writeJsonLine: WriteAgentRuntimeJsonLine;
};

const busyMessage = "当前 Agent runtime 已有运行中的协作任务，无法启动新协作";

const taskIdFor = (command: RunCommand) =>
  command.requestId?.trim() || command.input.requestId?.trim() || "";

const isRunCollaborationModeCommand = (
  command: RunCommand,
): command is RunCollaborationModeCommand =>
  command.type === AgentRuntimeCommandType.RunCollaborationMode;

export const createCollaborationCommandRunner = (deps: RunnerDeps) => {
  let activeRun: Promise<void> | null = null;

  const writeBusyResult = (command: RunCommand) => {
    deps.emit({
      type: AgentEventType.Error,
      message: busyMessage,
    });
    deps.writeJsonLine({
      type: AgentRuntimeResultType.CollaborationResult,
      requestId: command.requestId ?? null,
      workflowRunId: "",
      steps: [],
      success: false,
      message: busyMessage,
    });
    deps.writeJsonLine({
      type: "task_result",
      requestId: command.requestId ?? null,
      taskId: taskIdFor(command),
      success: false,
      message: busyMessage,
    });
  };

  const executeRun = (command: RunCommand) => {
    const runContext = {
      emit: deps.writeJsonLine,
    };
    return isRunCollaborationModeCommand(command)
      ? deps.collaborationEngine.runMode(
          {
            ...command.input,
            requestId: command.input.requestId ?? command.requestId ?? null,
          },
          runContext,
        )
      : deps.collaborationEngine.run(
          {
            ...command.input,
            requestId: command.input.requestId ?? command.requestId ?? null,
          },
          runContext,
        );
  };

  const run = (command: RunCommand) => {
    if (activeRun) {
      writeBusyResult(command);
      return;
    }

    activeRun = executeRun(command).then((result) => {
      deps.writeJsonLine({
        type: AgentRuntimeResultType.CollaborationResult,
        requestId: command.requestId ?? null,
        ...result,
      });
      deps.writeJsonLine({
        type: "task_result",
        requestId: command.requestId ?? null,
        taskId: taskIdFor(command),
        success: true,
      });
    }).catch((error: unknown) => {
      const message = messageFromError(error);
      deps.emit({
        type: AgentEventType.Error,
        taskId: taskIdFor(command) || undefined,
        message,
      });
      deps.writeJsonLine({
        type: "task_result",
        requestId: command.requestId ?? null,
        taskId: taskIdFor(command),
        success: false,
        message,
      });
    }).finally(() => {
      activeRun = null;
    });
  };

  const waitForRunningTask = async () => {
    if (activeRun) {
      await activeRun.catch(() => undefined);
    }
  };

  return {
    run,
    waitForRunningTask,
  };
};
