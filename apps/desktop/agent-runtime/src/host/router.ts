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
  AgentRuntimeCommandType,
  AgentRuntimeResultType,
  type AgentRuntimeCommand,
  type RunCollaborationCommand,
} from "../protocol/index.js";

type AgentRuntimeRouterDeps = {
  close: () => void;
  emit: EmitBridgeEvent;
  writeJsonLine: WriteBridgeJsonLine;
  collaborationEngine: CollaborationEngine;
};

const runningCollaborationMessage = "当前 Agent runtime 已有运行中的协作任务，无法启动新协作";

const collaborationTaskId = (command: RunCollaborationCommand) =>
  command.requestId?.trim() || command.input.requestId?.trim() || "";

const isRunCollaborationCommand = (
  command: AgentRuntimeCommand,
): command is RunCollaborationCommand =>
  command.type === AgentRuntimeCommandType.RunCollaboration;

const isBridgeCommand = (command: AgentRuntimeCommand): command is BridgeCommand =>
  !isRunCollaborationCommand(command);

export const createAgentRuntimeRouter = (deps: AgentRuntimeRouterDeps) => {
  let runningCollaboration: Promise<void> | null = null;
  const bridgeRouter = createBridgeCommandRouter(deps);
  const collaborationQuestions = createBridgeQuestionManager(deps.emit);

  const runCollaboration = (command: RunCollaborationCommand) => {
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

    runningCollaboration = deps.collaborationEngine.run(
      {
        ...command.input,
        requestId: command.input.requestId ?? command.requestId ?? null,
      },
      {
        askUser: collaborationQuestions.askUser,
        emit: deps.writeJsonLine,
      },
    ).then((result) => {
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
    if (isRunCollaborationCommand(command)) {
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
