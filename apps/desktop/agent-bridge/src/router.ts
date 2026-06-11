import {
  BRIDGE_AGENT_DEFINITIONS,
  DEFAULT_BRIDGE_AGENT_ID,
} from "./runtimes/index.js";
import { resolveBridgeRunner } from "./runners/index.js";
import {
  BridgeCommandType,
  BridgeEventType,
  BridgeResultType,
  type AgentDefinitionsResult,
  type BridgeCommand,
  type ChatCommand,
  type ChatResult,
  type StartTaskCommand,
} from "./contracts/protocol.js";
import type { AskUser, EmitBridgeEvent } from "./contracts/runtime.js";
import type { BridgeQuestionManager } from "./session/questions.js";

type WriteBridgeJsonLine = (value: unknown) => void;

type BridgeCommandHandlerDeps = {
  close: () => void;
  emit: EmitBridgeEvent;
  questions: BridgeQuestionManager;
  writeJsonLine: WriteBridgeJsonLine;
};

const messageFromError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const taskIdFromCommand = (command: BridgeCommand) =>
  "taskId" in command ? command.taskId : undefined;

const runningTaskMessage = "当前 Agent bridge 已有运行中的任务，无法启动新任务";

const createAgentDefinitionsResult = (
  command: { requestId?: string | null },
): AgentDefinitionsResult => ({
  type: BridgeResultType.AgentDefinitions,
  requestId: command.requestId ?? null,
  defaultAgentId: DEFAULT_BRIDGE_AGENT_ID,
  agents: BRIDGE_AGENT_DEFINITIONS,
});

const handleChatCommand = async (
  command: ChatCommand,
  emit: EmitBridgeEvent,
): Promise<ChatResult> => {
  const { runner } = resolveBridgeRunner(command);
  const result = await runner(command, { emit });
  return {
    ...result,
    requestId: command.requestId ?? null,
  };
};

const handleStartTaskCommand = async (
  command: StartTaskCommand,
  emit: EmitBridgeEvent,
  askUser: AskUser,
) => {
  const { runner } = resolveBridgeRunner(command);
  await runner(command, {
    askUser,
    emit,
  });
};

const writeTaskResult = (
  command: StartTaskCommand,
  deps: Pick<BridgeCommandHandlerDeps, "writeJsonLine">,
  result: { success: true } | { success: false; message: string },
) => {
  deps.writeJsonLine({
    type: BridgeResultType.TaskResult,
    requestId: command.requestId ?? null,
    taskId: command.taskId,
    ...result,
  });
};

const emitCommandError = (
  command: BridgeCommand,
  emit: EmitBridgeEvent,
  message: string,
) => {
  emit({
    type: BridgeEventType.Error,
    taskId: taskIdFromCommand(command),
    message,
  });
};

const runStartTask = async (
  command: StartTaskCommand,
  deps: Pick<BridgeCommandHandlerDeps, "emit" | "questions" | "writeJsonLine">,
) => {
  try {
    await handleStartTaskCommand(command, deps.emit, deps.questions.askUser);
    writeTaskResult(command, deps, { success: true });
  } catch (error: unknown) {
    const message = messageFromError(error);
    emitCommandError(command, deps.emit, message);
    writeTaskResult(command, deps, { success: false, message });
  }
};

export const createBridgeCommandRouter = (deps: BridgeCommandHandlerDeps) => {
  let runningTask: Promise<void> | null = null;

  const handle = async (command: BridgeCommand): Promise<boolean> => {
    switch (command.type) {
      case BridgeCommandType.AnswerQuestion:
        deps.questions.handleAnswer(command);
        return true;

      case BridgeCommandType.Ping:
        deps.writeJsonLine({
          type: BridgeResultType.Pong,
          requestId: command.requestId ?? null,
        });
        return true;

      case BridgeCommandType.Shutdown:
        deps.writeJsonLine({
          type: BridgeResultType.ShutdownAck,
          requestId: command.requestId ?? null,
        });
        deps.close();
        return false;

      case BridgeCommandType.ListAgents:
        deps.writeJsonLine(createAgentDefinitionsResult(command));
        return true;

      case BridgeCommandType.Chat:
        if (runningTask) {
          emitCommandError(command, deps.emit, "当前 Agent bridge 已有运行中的任务，无法启动 chat");
          return true;
        }

        deps.writeJsonLine(await handleChatCommand(command, deps.emit));
        return true;

      case BridgeCommandType.StartTask:
        if (runningTask) {
          emitCommandError(command, deps.emit, runningTaskMessage);
          writeTaskResult(command, deps, {
            success: false,
            message: runningTaskMessage,
          });
          return true;
        }

        runningTask = runStartTask(command, deps).finally(() => {
          runningTask = null;
        });
        return true;

      default:
        return true;
    }
  };

  const waitForRunningTask = async () => {
    if (runningTask) {
      await runningTask.catch(() => undefined);
    }
  };

  return {
    handle,
    waitForRunningTask,
  };
};
