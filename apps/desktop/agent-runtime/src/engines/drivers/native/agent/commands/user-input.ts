import { createApprovalManager } from "./approvals.js";
import type { AnswerApprovalParams } from "../../../../protocol/wire.js";
import { randomUUID } from "node:crypto";
import { AgentRuntimeEventType } from "../../../../protocol/wire.js";
import { type AnswerQuestionCommand } from "../../../../protocol/index.js";
import type { AgentRuntimeCallbacks, EmitAgentEvent, UserInputHandler, UserInputRequest } from "../runtimes/types.js";

const ASK_USER_TIMEOUT_MS = 3 * 60 * 1000;

type PendingQuestion = {
  taskId: string;
  expiresAt: number;
  resolve: (answer: string | null) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type QueuedQuestion = UserInputRequest & {
  questionId: string;
  resolve: (answer: string | null) => void;
  reject: (error: Error) => void;
};

export type UserInputManager = {
  callbacks: AgentRuntimeCallbacks;
  handleApprovalAnswer(command: AnswerApprovalParams): boolean;
  handleAnswer(command: AnswerQuestionCommand): void;
};

export const createUserInputManager = (emit: EmitAgentEvent): UserInputManager => {
  const approvals = createApprovalManager(emit);
  const pendingQuestions = new Map<string, PendingQuestion>();
  const activeQuestionIds = new Map<string, string>();
  const queuedQuestions = new Map<string, QueuedQuestion[]>();

  const emitNextQuestion = (taskId: string) => {
    if (activeQuestionIds.has(taskId)) {
      return;
    }

    const queue = queuedQuestions.get(taskId);
    if (!queue) {
      return;
    }

    const nextQuestion = queue.shift();
    if (!nextQuestion) {
      queuedQuestions.delete(taskId);
      return;
    }
    if (queue.length === 0) {
      queuedQuestions.delete(taskId);
    }

    const expiresAt = Date.now() + ASK_USER_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      pendingQuestions.delete(nextQuestion.questionId);
      activeQuestionIds.delete(taskId);
      emit({
        type: AgentRuntimeEventType.QuestionAnswered,
        taskId,
        questionId: nextQuestion.questionId,
        answer: null,
      });
      nextQuestion.reject(new Error(`等待用户回答超时：${nextQuestion.questionId}`));
      emitNextQuestion(taskId);
    }, ASK_USER_TIMEOUT_MS);

    activeQuestionIds.set(taskId, nextQuestion.questionId);
    pendingQuestions.set(nextQuestion.questionId, {
      taskId,
      expiresAt,
      resolve: nextQuestion.resolve,
      reject: nextQuestion.reject,
      timeout,
    });

    emit({
      type: AgentRuntimeEventType.Question,
      taskId,
      questionId: nextQuestion.questionId,
      question: nextQuestion.question,
      expiresAt,
      context: nextQuestion.context ?? null,
      input: nextQuestion.input,
    });
  };

  const requestUserInput: UserInputHandler = (request) => {
    return new Promise<string | null>((resolve, reject) => {
      const question: QueuedQuestion = {
        ...request,
        questionId: randomUUID(),
        resolve,
        reject,
      };
      const queue = queuedQuestions.get(request.taskId) ?? [];
      queue.push(question);
      queuedQuestions.set(request.taskId, queue);
      emitNextQuestion(request.taskId);
    });
  };

  const handleAnswer = (command: AnswerQuestionCommand) => {
    const pendingQuestion = pendingQuestions.get(command.questionId);
    if (!pendingQuestion || pendingQuestion.taskId !== command.taskId || Date.now() >= pendingQuestion.expiresAt) {
      return;
    }

    pendingQuestions.delete(command.questionId);
    activeQuestionIds.delete(command.taskId);
    clearTimeout(pendingQuestion.timeout);
    emit({
      type: AgentRuntimeEventType.QuestionAnswered,
      taskId: command.taskId,
      questionId: command.questionId,
      answer: command.answer,
    });
    pendingQuestion.resolve(command.answer);
    emitNextQuestion(command.taskId);
  };

  return {
    callbacks: {
      requestUserInput,
      requestApproval: approvals.request,
    },
    handleAnswer,
    handleApprovalAnswer: approvals.answer,
  };
};
