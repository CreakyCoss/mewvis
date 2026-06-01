import {
  createAgentDefinitionsResultForCommand,
  handleChatCommand,
  handleRunnableCommand,
} from "./commands.js";
import {
  BridgeCommandType,
  BridgeEventType,
  BridgeResultType,
  type AnswerQuestionCommand,
  type BridgeCommand,
  type StartTaskCommand,
} from "./contracts/protocol.js";
import { createBridgeQuestionManager } from "./session/questions.js";
import {
  createStdioBridgeReader,
  parseBridgeCommand,
  writeBridgeEvent,
  writeJsonLine,
  type StdioBridgeReader,
} from "./transport/stdio.js";

const messageFromError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const taskIdFromCommand = (command: BridgeCommand) =>
  "taskId" in command ? command.taskId : undefined;

const handleAnswerCommand = (
  command: AnswerQuestionCommand,
  handleAnswer: (command: AnswerQuestionCommand) => void,
) => {
  handleAnswer(command);
};

const runStartTask = async (
  command: StartTaskCommand,
  questions: ReturnType<typeof createBridgeQuestionManager>,
) => {
  try {
    await handleRunnableCommand(command, writeBridgeEvent, questions.askUser);
    writeJsonLine({
      type: BridgeResultType.TaskResult,
      requestId: command.requestId ?? null,
      taskId: command.taskId,
      success: true,
    });
  } catch (error: unknown) {
    const message = messageFromError(error);
    writeBridgeEvent({
      type: BridgeEventType.Error,
      taskId: command.taskId,
      message,
    });
    writeJsonLine({
      type: BridgeResultType.TaskResult,
      requestId: command.requestId ?? null,
      taskId: command.taskId,
      success: false,
      message,
    });
  }
};

const handleCommand = async (
  command: BridgeCommand,
  reader: StdioBridgeReader,
  questions: ReturnType<typeof createBridgeQuestionManager>,
  runningTask: { promise: Promise<void> | null },
) => {
  if (command.type === BridgeCommandType.AnswerQuestion) {
    handleAnswerCommand(command, questions.handleAnswer);
    return true;
  }

  if (command.type === BridgeCommandType.Ping) {
    writeJsonLine({
      type: BridgeResultType.Pong,
      requestId: command.requestId ?? null,
    });
    return true;
  }

  if (command.type === BridgeCommandType.Shutdown) {
    writeJsonLine({
      type: BridgeResultType.ShutdownAck,
      requestId: command.requestId ?? null,
    });
    reader.close();
    return false;
  }

  if (command.type === BridgeCommandType.ListAgents) {
    writeJsonLine(createAgentDefinitionsResultForCommand(command));
    return true;
  }

  if (command.type === BridgeCommandType.Chat) {
    if (runningTask.promise) {
      writeBridgeEvent({
        type: BridgeEventType.Error,
        taskId: taskIdFromCommand(command),
        message: "当前 Agent bridge 已有运行中的任务，无法启动 chat",
      });
      return true;
    }

    writeJsonLine(await handleChatCommand(command, writeBridgeEvent));
    return true;
  }

  if (command.type === BridgeCommandType.StartTask) {
    if (runningTask.promise) {
      writeBridgeEvent({
        type: BridgeEventType.Error,
        taskId: command.taskId,
        message: "当前 Agent bridge 已有运行中的任务，无法启动新任务",
      });
      writeJsonLine({
        type: BridgeResultType.TaskResult,
        requestId: command.requestId ?? null,
        taskId: command.taskId,
        success: false,
        message: "当前 Agent bridge 已有运行中的任务，无法启动新任务",
      });
      return true;
    }

    runningTask.promise = runStartTask(command, questions).finally(() => {
      runningTask.promise = null;
    });
    return true;
  }

  return true;
};

const main = async () => {
  const reader = createStdioBridgeReader();
  const questions = createBridgeQuestionManager(writeBridgeEvent);
  const runningTask: { promise: Promise<void> | null } = { promise: null };

  try {
    for await (const line of reader) {
      let command: BridgeCommand;
      try {
        command = parseBridgeCommand(line);
      } catch (error: unknown) {
        writeBridgeEvent({
          type: BridgeEventType.Error,
          message: messageFromError(error),
        });
        continue;
      }

      const keepRunning = await handleCommand(command, reader, questions, runningTask);
      if (!keepRunning) {
        break;
      }
    }
  } finally {
    if (runningTask.promise) {
      await runningTask.promise.catch(() => undefined);
    }
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  writeBridgeEvent({
    type: BridgeEventType.Error,
    message: messageFromError(error),
  });
  process.exitCode = 1;
});
