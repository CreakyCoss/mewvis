import { randomUUID } from "node:crypto";
import {
  BridgeEventType,
  type AnswerQuestionCommand,
  type AskUserInput,
} from "../contracts/protocol.js";
import type { AskUser, EmitBridgeEvent } from "../contracts/runtime.js";

const ASK_USER_TIMEOUT_MS = 10 * 60 * 1000;

type PendingQuestion = {
  resolve: (answer: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type BridgeQuestionManager = {
  askUser: AskUser;
  handleAnswer(command: AnswerQuestionCommand): void;
};

export const createBridgeQuestionManager = (
  emit: EmitBridgeEvent,
): BridgeQuestionManager => {
  const pendingQuestions = new Map<string, PendingQuestion>();

  const askUser: AskUser = (
    taskId: string,
    question: string,
    context?: string | null,
    input?: AskUserInput,
  ) => {
    const questionId = randomUUID();

    emit({
      type: BridgeEventType.Question,
      taskId,
      questionId,
      question,
      context: context ?? null,
      input,
    });

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingQuestions.delete(questionId);
        reject(new Error(`等待用户回答超时：${questionId}`));
      }, ASK_USER_TIMEOUT_MS);

      pendingQuestions.set(questionId, {
        resolve,
        timeout,
      });
    });
  };

  const handleAnswer = (command: AnswerQuestionCommand) => {
    const pendingQuestion = pendingQuestions.get(command.questionId);
    if (!pendingQuestion) {
      emit({
        type: BridgeEventType.Error,
        taskId: command.taskId,
        message: `未找到待回答的问题：${command.questionId}`,
      });
      return;
    }

    pendingQuestions.delete(command.questionId);
    clearTimeout(pendingQuestion.timeout);
    emit({
      type: BridgeEventType.QuestionAnswered,
      taskId: command.taskId,
      questionId: command.questionId,
      answer: command.answer,
    });
    pendingQuestion.resolve(command.answer);
  };

  return {
    askUser,
    handleAnswer,
  };
};
