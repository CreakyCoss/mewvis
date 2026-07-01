import {
  AgentEventType,
  type AgentEvent,
} from "../../../protocol/index.js";
import { resolveRuntime } from "../runtimes/resolver.js";
import type {
  AgentRunCommand,
  AgentRunResult,
  AgentRuntimeContext,
  ChatRunResult,
  ChatRuntimeContext,
  ChatRunCommand,
} from "../runtimes/types.js";
import { prepareRuntimeAgentRun } from "./prepare-run.js";
import { createPromptLimits, toRuntimeMessages } from "../../session/model/prompt-budget.js";
import { RuntimeSessionRecorder } from "../../session/recorder.js";
import { createRuntimeSessionManager } from "../../session/index.js";
import { messageFromError } from "../../error.js";

const CHAT_TIMEOUT_MS = 10 * 60 * 1000;
const CHAT_MAX_ATTEMPTS = 2;
const CHAT_PROVIDER_MAX_RETRIES = 0;
const CHAT_RETRY_BASE_DELAY_MS = 600;

const RETRYABLE_ERROR_CODES = new Set([
  "ABORT_ERR",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const RETRYABLE_ERROR_MESSAGES = [
  "timeout",
  "timed out",
  "fetch failed",
  "network",
  "socket",
  "connection reset",
  "connection refused",
  "temporarily unavailable",
  "too many requests",
  "rate limit",
  "aborted",
  "429",
  "500",
  "502",
  "503",
  "504",
  "超时",
  "网络",
];

export const executeAgentRunCommand = (
  command: AgentRunCommand,
  context: AgentRuntimeContext,
): Promise<AgentRunResult> => executeAgentRunCommandWithRecording(command, context);

const executeAgentRunCommandWithRecording = async (
  command: AgentRunCommand,
  context: AgentRuntimeContext,
): Promise<AgentRunResult> => {
  const { runtimeId, implementation } = resolveRuntime("agent", command.agentId);
  const preparedRun = await prepareRuntimeAgentRun(command, runtimeId);
  const runtimeCommand = preparedRun.command;
  const runtimeContext = preparedRun.nativeSession
    ? {
      ...context,
      nativeSession: preparedRun.nativeSession,
    }
    : context;
  const recorder = await RuntimeSessionRecorder.create(runtimeCommand);
  await recorder?.recordInitialUserMessage();
  try {
    return await implementation.run(runtimeCommand, recorder
      ? { ...runtimeContext, emit: recorder.wrapEmit(runtimeContext.emit) }
      : runtimeContext);
  } finally {
    await recorder?.flush();
  }
};

export const executeChatCommand = async (
  command: ChatRunCommand,
  context: ChatRuntimeContext,
): Promise<ChatRunResult> => {
  const { implementation } = resolveRuntime("chat", command.agentId);
  const runtimeCommand = await prepareChatRunCommand(command);
  const recorder = await RuntimeSessionRecorder.create(runtimeCommand);
  await recorder?.recordInitialUserMessage();
  let lastError: unknown;

  for (let attempt = 1; attempt <= CHAT_MAX_ATTEMPTS; attempt += 1) {
    const abortController = new AbortController();
    const attemptState = {
      active: true,
      emitted: false,
    };
    const guardedContext: ChatRuntimeContext = {
      ...context,
      signal: abortController.signal,
      maxRetries: CHAT_PROVIDER_MAX_RETRIES,
      emit: (event) => {
        if (!attemptState.active) {
          return;
        }

        attemptState.emitted ||= isVisibleChatOutputEvent(runtimeCommand, event);
        (recorder ? recorder.wrapEmit(context.emit) : context.emit)(event);
      },
    };

    try {
      const result = await withTimeout(
        implementation.chat(runtimeCommand, guardedContext),
        CHAT_TIMEOUT_MS,
        `Chat runtime 执行超时（${formatDuration(CHAT_TIMEOUT_MS)}）`,
        () => abortController.abort(),
      );
      if (recorder) {
        await recorder.finalizeAssistantMessage({
          text: result.text,
          thinking: result.thinking ?? null,
          runStatus: "done",
        });
        await recorder.flush();
        return {
          ...result,
          runtimeSession: recorder.getSessionRecord(),
        };
      }
      return result;
    } catch (error: unknown) {
      attemptState.active = false;
      abortController.abort();
      lastError = error;

      if (!shouldRetryChatAttempt(error, attempt, attemptState.emitted)) {
        throw error;
      }

      console.warn(
        `Chat runtime retry ${attempt}/${CHAT_MAX_ATTEMPTS - 1}: ${messageFromError(error)}`,
      );
      await sleep(retryDelayMs(attempt));
    } finally {
      attemptState.active = false;
    }
  }

  throw lastError;
};

const latestUserMessageContent = (command: ChatRunCommand) => {
  const direct = command.userMessage?.trim();
  if (direct) {
    return direct;
  }

  for (const message of (command.messages ?? []).slice().reverse()) {
    if (message.role === "user" && message.content.trim()) {
      return message.content.trim();
    }
  }

  return "";
};

const prepareChatRunCommand = async (
  command: ChatRunCommand,
): Promise<ChatRunCommand> => {
  const userMessage = latestUserMessageContent(command);

  if (command.userMessage?.trim() && command.workspacePath?.trim() && command.sessionRootDir?.trim()) {
    const preparedTurn = await createRuntimeSessionManager({
      workspacePath: command.workspacePath,
      sessionRootDir: command.sessionRootDir,
    }).prepareTurn(
      {
        ...command,
        messages: command.messages ?? [],
      },
      {
        includeSummary: true,
        preserveRecordUserMessageFalse: true,
      },
    );
    if (!preparedTurn) {
      throw new Error("chat 命令启用 runtime session 时必须提供 workspacePath 和 sessionRootDir");
    }
    return {
      ...preparedTurn.command,
      systemPrompt: preparedTurn.systemPrompt,
      messages: toRuntimeMessages(
        preparedTurn.updatedSessionContext.messages,
        userMessage,
        createPromptLimits(command.runtimeModel),
        command.requestContext,
        command.runtimeInstruction,
      ),
    };
  }

  const messages = command.messages?.length
    ? command.messages
    : userMessage
      ? [{ role: "user", content: userMessage }]
      : [];
  if (messages.length === 0) {
    throw new Error("chat 命令必须提供 userMessage 或 messages");
  }

  return {
    ...command,
    messages,
  };
};

class ExecutionTimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "ExecutionTimeoutError";
  }
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new ExecutionTimeoutError(message, timeoutMs));
          onTimeout?.();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const shouldRetryChatAttempt = (
  error: unknown,
  attempt: number,
  emitted: boolean,
) =>
  attempt < CHAT_MAX_ATTEMPTS
  && !emitted
  && isRetryableExecutionError(error);

const isRetryableExecutionError = (error: unknown) => {
  if (error instanceof ExecutionTimeoutError) {
    return true;
  }

  const details = objectFromUnknown(error);
  const name = stringFromUnknown(details?.name);
  if (name === "AbortError") {
    return true;
  }

  const code = stringFromUnknown(details?.code)?.toUpperCase();
  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  const status = numberFromUnknown(
    details?.status ?? details?.statusCode ?? objectFromUnknown(details?.response)?.status,
  );
  if (
    status === 408
    || status === 409
    || status === 425
    || status === 429
    || (status !== null && status >= 500)
  ) {
    return true;
  }

  const message = messageFromError(error).toLowerCase();
  return RETRYABLE_ERROR_MESSAGES.some((keyword) => message.includes(keyword));
};

const isVisibleChatOutputEvent = (command: ChatRunCommand, event: AgentEvent) => {
  if (!command.streamId || !("taskId" in event) || event.taskId !== command.streamId) {
    return false;
  }

  return event.type === AgentEventType.TextDelta
    || event.type === AgentEventType.ThinkingDelta
    || event.type === AgentEventType.ReplaceText
    || event.type === AgentEventType.ThinkingEnd
    || event.type === AgentEventType.Done;
};

const retryDelayMs = (attempt: number) =>
  CHAT_RETRY_BASE_DELAY_MS * attempt;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const formatDuration = (durationMs: number) => {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes >= 1) {
    return `${minutes} 分钟`;
  }

  return `${Math.round(durationMs / 1000)} 秒`;
};

const objectFromUnknown = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

const stringFromUnknown = (value: unknown) =>
  typeof value === "string" ? value : null;

const numberFromUnknown = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
