import {
  BridgeCommandType,
  type BridgeCommand,
  type ChatCommand,
  type ChatResult,
  type StartTaskCommand,
} from "../contracts/protocol.js";
import {
  executeChatCommand,
  executeStartTaskCommand,
} from "./execution.js";
import type { AskUser, EmitBridgeEvent } from "../runtimes/types.js";
import { createBridgeQuestionManager } from "./questions.js";
import { messageFromError } from "../utils/error.js";
import {
  createAgentDefinitionsResult,
  createPongResult,
  createShutdownAckResult,
  emitCommandError,
  writeTaskResult,
  type WriteBridgeJsonLine,
} from "./responses.js";

type BridgeCommandHandlerDeps = {
  close: () => void;
  emit: EmitBridgeEvent;
  writeJsonLine: WriteBridgeJsonLine;
};

const runningTaskMessage = "当前 Agent bridge 已有运行中的任务，无法启动新任务";
const runningTaskChatMessage = "当前 Agent bridge 已有运行中的任务，无法启动 chat";

const handleChatCommand = async (
  command: ChatCommand,
  emit: EmitBridgeEvent,
): Promise<ChatResult> => {
  const result = await executeChatCommand(command, { emit });
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
  await executeStartTaskCommand(command, {
    askUser,
    emit,
  });
};

const runChat = async (
  command: ChatCommand,
  deps: Pick<BridgeCommandHandlerDeps, "emit" | "writeJsonLine">,
) => {
  try {
    deps.writeJsonLine(await handleChatCommand(command, deps.emit));
  } catch (error: unknown) {
    emitCommandError(command, deps.emit, messageFromError(error));
  }
};

const runStartTask = async (
  command: StartTaskCommand,
  deps: Pick<BridgeCommandHandlerDeps, "emit" | "writeJsonLine"> & {
    askUser: AskUser;
  },
) => {
  try {
    await handleStartTaskCommand(command, deps.emit, deps.askUser);
    writeTaskResult(command, deps.writeJsonLine, { success: true });
  } catch (error: unknown) {
    const message = messageFromError(error);
    emitCommandError(command, deps.emit, message);
    writeTaskResult(command, deps.writeJsonLine, { success: false, message });
  }
};

export const createBridgeCommandRouter = (deps: BridgeCommandHandlerDeps) => {
  let runningTask: Promise<void> | null = null;
  const questions = createBridgeQuestionManager(deps.emit);

  const handle = async (command: BridgeCommand): Promise<boolean> => {
    switch (command.type) {
      case BridgeCommandType.AnswerQuestion:
        questions.handleAnswer(command);
        return true;

      case BridgeCommandType.Ping:
        deps.writeJsonLine(createPongResult(command));
        return true;

      case BridgeCommandType.Shutdown:
        deps.writeJsonLine(createShutdownAckResult(command));
        deps.close();
        return false;

      case BridgeCommandType.ListAgents:
        deps.writeJsonLine(createAgentDefinitionsResult(command));
        return true;

      case BridgeCommandType.Chat:
        if (runningTask) {
          emitCommandError(command, deps.emit, runningTaskChatMessage);
          return true;
        }

        await runChat(command, deps);
        return true;

      case BridgeCommandType.StartTask:
        if (runningTask) {
          emitCommandError(command, deps.emit, runningTaskMessage);
          writeTaskResult(command, deps.writeJsonLine, {
            success: false,
            message: runningTaskMessage,
          });
          return true;
        }

        runningTask = runStartTask(command, {
          ...deps,
          askUser: questions.askUser,
        }).finally(() => {
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
