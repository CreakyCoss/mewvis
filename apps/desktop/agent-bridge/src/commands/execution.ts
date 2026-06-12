import {
  type BridgeEvent,
  type ChatCommand,
  type ChatResult,
  type StartTaskCommand,
} from "../contracts/protocol.js";
import { resolveRuntime } from "../runtimes/index.js";
import type {
  AgentRunResult,
  AgentRuntimeContext,
  ChatRuntimeContext,
} from "../runtimes/types.js";
import { messageFromError } from "../utils/error.js";

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

export const executeStartTaskCommand = (
  command: StartTaskCommand,
  context: AgentRuntimeContext,
): Promise<AgentRunResult> => {
  const { implementation } = resolveRuntime("agent", command.agentId);
  return implementation.run(command, context);
};

export const executeChatCommand = async (
  command: ChatCommand,
  context: ChatRuntimeContext,
): Promise<ChatResult> => {
  const { implementation } = resolveRuntime("chat", command.agentId);
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

        attemptState.emitted ||= isVisibleChatEvent(command, event);
        context.emit(event);
      },
    };

    try {
      return await withTimeout(
        implementation.chat(command, guardedContext),
        CHAT_TIMEOUT_MS,
        `Chat runtime 执行超时（${formatDuration(CHAT_TIMEOUT_MS)}）`,
        () => abortController.abort(),
      );
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

const isVisibleChatEvent = (command: ChatCommand, event: BridgeEvent) => {
  if (!command.streamId) {
    return false;
  }

  return "taskId" in event && event.taskId === command.streamId;
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
