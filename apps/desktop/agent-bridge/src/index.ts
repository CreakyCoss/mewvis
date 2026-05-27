import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { resolveBridgeRunner } from "./runners/index.js";
import { isRunnableBridgeCommand } from "./runners/types.js";
import {
  BridgeCommandType,
  BridgeEventType,
  type AnswerQuestionCommand,
  type AskUserInput,
  type BridgeCommand,
  type BridgeEvent,
  type ChatCommand,
  type ChatResult,
  type StartTaskCommand,
} from "./contracts/protocol.js";

const writeEvent = (event: BridgeEvent) => {
  output.write(`${JSON.stringify(event)}\n`);
};

const writeChatResult = (result: ChatResult) => {
  output.write(`${JSON.stringify(result)}\n`);
};

const pendingQuestions = new Map<string, (answer: string) => void>();

const askUser = (
  taskId: string,
  question: string,
  context?: string | null,
  input?: AskUserInput,
) => {
  const questionId = randomUUID();

  writeEvent({
    type: BridgeEventType.Question,
    taskId,
    questionId,
    question,
    context: context ?? null,
    input,
  });

  return new Promise<string>((resolve) => {
    pendingQuestions.set(questionId, resolve);
  });
};

const parseCommand = (line: string): BridgeCommand => {
  if (!line.trim()) {
    throw new Error("未收到 Agent bridge 命令");
  }

  const command = JSON.parse(line) as BridgeCommand;
  if (!Object.values(BridgeCommandType).includes(command.type)) {
    throw new Error(`未知 Agent bridge 命令：${(command as { type?: string }).type}`);
  }

  return command;
};

const handleAnswer = (command: AnswerQuestionCommand) => {
  const resolve = pendingQuestions.get(command.questionId);
  if (!resolve) {
    writeEvent({
      type: BridgeEventType.Error,
      taskId: command.taskId,
      message: `未找到待回答的问题：${command.questionId}`,
    });
    return;
  }

  pendingQuestions.delete(command.questionId);
  writeEvent({
    type: BridgeEventType.QuestionAnswered,
    taskId: command.taskId,
    questionId: command.questionId,
    answer: command.answer,
  });
  resolve(command.answer);
};

const readFollowUpCommands = async (
  reader: ReturnType<typeof createInterface>,
) => {
  for await (const line of reader) {
    const command = parseCommand(line);
    if (command.type === BridgeCommandType.AnswerQuestion) {
      handleAnswer(command);
      continue;
    }

    writeEvent({
      type: BridgeEventType.Error,
      taskId: "taskId" in command ? command.taskId : undefined,
      message: "当前 Agent bridge 已有运行中的任务，无法启动新任务",
    });
  }
};

const handleChatCommand = async (command: ChatCommand) => {
  const { runner } = resolveBridgeRunner(command);
  const result = await runner(command, {
    emit: writeEvent,
  });
  writeChatResult(result);
};

const handleStartTaskCommand = async (command: StartTaskCommand) => {
  const { runner } = resolveBridgeRunner(command);
  await runner(command, {
    askUser,
    emit: writeEvent,
  });
};

const handleRunnableCommand = async (command: Exclude<BridgeCommand, AnswerQuestionCommand>) => {
  if (!isRunnableBridgeCommand(command)) {
    throw new Error("Agent bridge 首条命令必须是 start_task 或 chat");
  }

  if (command.type === BridgeCommandType.Chat) {
    await handleChatCommand(command);
    return;
  }

  await handleStartTaskCommand(command);
};

const main = async () => {
  const reader = createInterface({ input });
  const iterator = reader[Symbol.asyncIterator]();
  const line = await iterator.next();

  if (line.done) {
    throw new Error("未收到 Agent bridge 命令");
  }

  const command = parseCommand(line.value);
  if (command.type === BridgeCommandType.Chat) {
    await handleRunnableCommand(command);
    reader.close();
    return;
  }

  if (command.type !== BridgeCommandType.StartTask) {
    throw new Error("Agent bridge 首条命令必须是 start_task 或 chat");
  }

  const followUpReader = readFollowUpCommands(reader).catch((error: unknown) => {
    writeEvent({
      type: BridgeEventType.Error,
      taskId: command.taskId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  await handleRunnableCommand(command);
  reader.close();
  await followUpReader;
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  writeEvent({
    type: BridgeEventType.Error,
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
