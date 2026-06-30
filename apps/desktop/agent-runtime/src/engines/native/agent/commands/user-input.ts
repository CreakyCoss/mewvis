import { randomUUID } from "node:crypto";
import {
  AgentEventType,
  type AnswerQuestionCommand,
} from "../../../protocol/index.js";
import type {
  AgentRuntimeCallbacks,
  EmitAgentEvent,
  UserInputHandler,
} from "../runtimes/types.js";

const ASK_USER_TIMEOUT_MS = 10 * 60 * 1000;

type PendingQuestion = {
  resolve: (answer: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type UserInputManager = {
  callbacks: AgentRuntimeCallbacks;
  handleAnswer(command: AnswerQuestionCommand): void;
};

export const createUserInputManager = (
  emit: EmitAgentEvent,
): UserInputManager => {
  const pendingQuestions = new Map<string, PendingQuestion>();

  const requestUserInput: UserInputHandler = ({
    taskId,
    question,
    context,
    input,
  }) => {
    const questionId = randomUUID();

    emit({
      type: AgentEventType.Question,
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
      return;
    }

    pendingQuestions.delete(command.questionId);
    clearTimeout(pendingQuestion.timeout);
    emit({
      type: AgentEventType.QuestionAnswered,
      taskId: command.taskId,
      questionId: command.questionId,
      answer: command.answer,
    });
    pendingQuestion.resolve(command.answer);
  };

  return {
    callbacks: {
      requestUserInput,
    },
    handleAnswer,
  };
};
