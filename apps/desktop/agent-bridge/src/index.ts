import {
  BridgeCommandType,
  BridgeEventType,
  type AnswerQuestionCommand,
} from "./contracts/protocol.js";
import {
  createAgentDefinitionsResult,
  handleChatCommand,
  handleRunnableCommand,
} from "./commands.js";
import { createBridgeQuestionManager } from "./session/questions.js";
import {
  createStdioBridgeReader,
  parseBridgeCommand,
  readInitialBridgeCommand,
  writeBridgeEvent,
  writeJsonLine,
  type StdioBridgeReader,
} from "./transport/stdio.js";

const readFollowUpCommands = async (
  reader: StdioBridgeReader,
  handleAnswer: (command: AnswerQuestionCommand) => void,
) => {
  for await (const line of reader) {
    const command = parseBridgeCommand(line);
    if (command.type === BridgeCommandType.AnswerQuestion) {
      handleAnswer(command);
      continue;
    }

    writeBridgeEvent({
      type: BridgeEventType.Error,
      taskId: "taskId" in command ? command.taskId : undefined,
      message: "当前 Agent bridge 已有运行中的任务，无法启动新任务",
    });
  }
};

const main = async () => {
  const reader = createStdioBridgeReader();
  const command = await readInitialBridgeCommand(reader);
  const questions = createBridgeQuestionManager(writeBridgeEvent);

  if (command.type === BridgeCommandType.ListAgents) {
    writeJsonLine(createAgentDefinitionsResult());
    reader.close();
    return;
  }

  if (command.type === BridgeCommandType.Chat) {
    const result = await handleChatCommand(command, writeBridgeEvent);
    writeJsonLine(result);
    reader.close();
    return;
  }

  if (command.type !== BridgeCommandType.StartTask) {
    throw new Error("Agent bridge 首条命令必须是 start_task 或 chat");
  }

  const followUpReader = readFollowUpCommands(reader, questions.handleAnswer).catch((error: unknown) => {
    writeBridgeEvent({
      type: BridgeEventType.Error,
      taskId: command.taskId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  await handleRunnableCommand(command, writeBridgeEvent, questions.askUser);
  reader.close();
  await followUpReader;
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  writeBridgeEvent({
    type: BridgeEventType.Error,
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
