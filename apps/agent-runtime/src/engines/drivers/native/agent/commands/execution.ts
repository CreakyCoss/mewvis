import { randomUUID } from "node:crypto";
import { AgentRuntimeEventType, type AgentEvent } from "../../../../protocol/wire.js";
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
import { RuntimeSessionRecorder } from "../../session/recorder.js";
import { messageFromError } from "../../error.js";
import type { RuntimeSessionProviderId } from "../../session/providers/types.js";

import type { ExtensionSource } from "@mewvis/extension-host";
import { resolveExtensionAdaptation } from "@mewvis/extension-host";
import type { RuntimeAgentRegistry } from "../runtimes/registry.js";
import {
  createExtensionRuntime,
  type ExtensionOperation,
  type ExtensionRuntime,
} from "../../../../../extensions/index.js";

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
  options: AgentExecutionOptions = {},
): Promise<AgentRunResult> => executeAgentRunCommandWithRecording(command, context, options);

export type AgentExecutionOptions = {
  registry?: RuntimeAgentRegistry;
  extensions?: readonly ExtensionSource[];
  extensionRuntime?: ExtensionRuntime;
  agentRuntimeId?: string | null;
  chatRuntimeId?: string | null;
  sessionProviderId?: RuntimeSessionProviderId | null;
};

const runtimeIdOverride = (commandRuntimeId: string | null | undefined, defaultId: string | null | undefined) =>
  commandRuntimeId?.trim() || defaultId?.trim() || null;

const executeAgentRunCommandWithRecording = async (
  command: AgentRunCommand,
  context: AgentRuntimeContext,
  options: AgentExecutionOptions,
): Promise<AgentRunResult> => {
  options.extensionRuntime?.signal.throwIfAborted();
  const { runtimeId, implementation } = resolveRuntime(
    "agent",
    runtimeIdOverride(command.runtimeId, options.agentRuntimeId),
    options.registry,
  );
  if (options.extensions?.length) {
    if (!implementation.extensionAdapter) throw new Error(`${runtimeId} 不支持 Mewvis 插件能力`);
    const report = resolveExtensionAdaptation(implementation.extensionAdapter, options.extensions);
    context.callbacks.onExtensionAdaptation?.(report);
  }
  context.signal?.throwIfAborted();
  const preparedRun = await prepareRuntimeAgentRun(command, runtimeId, {
    sessionProviderId: options.sessionProviderId,
  });
  const runtimeCommand = preparedRun.command;
  const runtimeContext = preparedRun.nativeSession
    ? {
        ...context,
        nativeSession: preparedRun.nativeSession,
      }
    : context;
  const recorder = await RuntimeSessionRecorder.create(runtimeCommand, options.sessionProviderId);
  const extensionRuntime = options.extensionRuntime ?? createExtensionRuntime();
  let extensions: ExtensionOperation | undefined;
  let started = false;
  let completed = false;
  const emit = recorder ? recorder.wrapEmit(runtimeContext.emit) : runtimeContext.emit;
  try {
    await recorder?.recordInitialUserMessage();
    extensions = options.extensions?.length
      ? await extensionRuntime.open(options.extensions, runtimeCommand, runtimeContext)
      : undefined;
    if (!extensions && runtimeCommand.sessionRootDir) {
      // An empty source snapshot must retire previously enabled plugins too.
      await extensionRuntime.releaseSession(runtimeCommand.sessionRootDir);
    }
    if (extensions) {
      await extensions.notify({
        type: "run_started",
        taskId: command.taskId,
        runtimeId,
      });
      started = true;
    }
    context.signal?.throwIfAborted();
    const slash =
      /^\/([a-z][a-z0-9.-]*\/[a-z][a-z0-9_]*)(?:\s+([\s\S]*))?$/.exec(
        command.userMessage.trim(),
      );
    const registered = slash && extensions?.catalog.commands.find((item) => item.id === slash[1]);
    if (slash && registered && extensions) {
      emit({ type: AgentRuntimeEventType.Started, taskId: command.taskId });
      const input =
        registered.inputMode === "text"
          ? { text: slash[2] ?? "" }
          : JSON.parse(slash[2] || "{}");
      const value = await extensions.command(registered.id, input, {
        callId: randomUUID(),
        signal: context.signal,
      });
      const text =
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof value.text === "string"
          ? value.text
          : JSON.stringify(value);
      emit({
        type: AgentRuntimeEventType.TextDelta,
        taskId: command.taskId,
        delta: text,
      });
      emit({ type: AgentRuntimeEventType.Done, taskId: command.taskId, text });
      completed = true;
      return { text };
    }
    const result = await implementation.run(runtimeCommand, {
      ...runtimeContext,
      extensions,
      emit,
    });
    context.signal?.throwIfAborted();
    completed = true;
    return result;
  } finally {
    try {
      if (started && extensions) {
        await extensions.finish({
          type: "run_finished",
          taskId: command.taskId,
          status: context.signal?.aborted ? "cancelled" : completed ? "completed" : "failed",
        });
      }
    } finally {
      try {
        await extensions?.dispose();
      } finally {
        try {
          if (!options.extensionRuntime) await extensionRuntime.dispose();
        } finally {
          await recorder?.flush();
        }
      }
    }
  }
};

export const executeChatCommand = async (
  command: ChatRunCommand,
  context: ChatRuntimeContext,
  options: AgentExecutionOptions = {},
): Promise<ChatRunResult> => {
  const { implementation } = resolveRuntime(
    "chat",
    runtimeIdOverride(command.runtimeId, options.chatRuntimeId),
    options.registry,
  );
  const runtimeCommand = prepareChatRunCommand(command);
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
        context.emit(event);
      },
    };

    try {
      const result = await withTimeout(
        implementation.chat(runtimeCommand, guardedContext),
        CHAT_TIMEOUT_MS,
        `Chat runtime 执行超时（${formatDuration(CHAT_TIMEOUT_MS)}）`,
        () => abortController.abort(),
      );
      return result;
    } catch (error: unknown) {
      attemptState.active = false;
      abortController.abort();
      lastError = error;

      if (!shouldRetryChatAttempt(error, attempt, attemptState.emitted)) {
        throw error;
      }

      console.warn(`Chat runtime retry ${attempt}/${CHAT_MAX_ATTEMPTS - 1}: ${messageFromError(error)}`);
      await sleep(retryDelayMs(attempt));
    } finally {
      attemptState.active = false;
    }
  }

  throw lastError;
};

const prepareChatRunCommand = (command: ChatRunCommand): ChatRunCommand => {
  if (!command.messages.length) {
    throw new Error("chat 命令必须提供 messages");
  }

  return command;
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

const shouldRetryChatAttempt = (error: unknown, attempt: number, emitted: boolean) =>
  attempt < CHAT_MAX_ATTEMPTS && !emitted && isRetryableExecutionError(error);

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
  if (status === 408 || status === 409 || status === 425 || status === 429 || (status !== null && status >= 500)) {
    return true;
  }

  const message = messageFromError(error).toLowerCase();
  return RETRYABLE_ERROR_MESSAGES.some((keyword) => message.includes(keyword));
};

const isVisibleChatOutputEvent = (command: ChatRunCommand, event: AgentEvent) => {
  if (!command.streamId || !("taskId" in event) || event.taskId !== command.streamId) {
    return false;
  }

  return (
    event.type === AgentRuntimeEventType.TextDelta ||
    event.type === AgentRuntimeEventType.ThinkingDelta ||
    event.type === AgentRuntimeEventType.ReplaceText ||
    event.type === AgentRuntimeEventType.ThinkingEnd ||
    event.type === AgentRuntimeEventType.Done
  );
};

const retryDelayMs = (attempt: number) => CHAT_RETRY_BASE_DELAY_MS * attempt;

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
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const stringFromUnknown = (value: unknown) => (typeof value === "string" ? value : null);

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
