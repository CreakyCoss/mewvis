import {
  BridgeEventType,
  type BridgeEvent,
  type ChatResult,
} from "../contracts/protocol.js";
import { resolveRuntime } from "../runtimes/resolver.js";
import type {
  AgentRunCommand,
  AgentRunResult,
  AgentRuntimeContext,
  ChatRuntimeContext,
  RuntimeChatCommand,
  RuntimeAgentCommand,
} from "../runtimes/types.js";
import { resolveAgentSessionDir } from "../session/runtime/agent/session-plan.js";
import { prepareBridgeRuntimeAgentPrompt } from "../session/runtime/agent/prompt.js";
import { BridgeLedgerStorage } from "../../../session/storage/jsonl-store.js";
import { resolveBridgeSessionPaths } from "../../../session/storage/paths.js";
import { createPromptLimits, toRuntimeMessages } from "../session/core/prompt-budget.js";
import { BridgeSessionRecorder } from "../session/runtime/recorder.js";
import { buildBridgeSessionContext } from "../../../session/core/projection.js";
import {
  appendRuntimeSystemPromptIfNeeded,
  composeRuntimeSystemPrompt,
} from "../session/runtime/system-prompt.js";
import {
  commandParentEntryId,
  inferCommandTurnId,
  shouldRecordRuntimeUserMessage,
  withSessionLink,
} from "../session/runtime/session-link.js";
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

export const executeAgentRunCommand = (
  command: AgentRunCommand,
  context: AgentRuntimeContext,
): Promise<AgentRunResult> => executeAgentRunCommandWithRecording(command, context);

const executeAgentRunCommandWithRecording = async (
  command: AgentRunCommand,
  context: AgentRuntimeContext,
): Promise<AgentRunResult> => {
  const { runtimeId, implementation } = resolveRuntime("agent", command.agentId);
  const runtimeCommand = await prepareRuntimeAgentCommand(command, runtimeId);
  const recorder = await BridgeSessionRecorder.create(runtimeCommand);
  await recorder?.recordInitialUserMessage();
  try {
    return await implementation.run(runtimeCommand, recorder
      ? { ...context, emit: recorder.wrapEmit(context.emit) }
      : context);
  } finally {
    await recorder?.flush();
  }
};

const prepareRuntimeAgentCommand = async (
  command: AgentRunCommand,
  runtimeId: string,
): Promise<RuntimeAgentCommand> => {
  const commandWithPrompt = await prepareBridgeRuntimeAgentPrompt(command, runtimeId);
  const agentSessionDir = await resolveAgentSessionDir(commandWithPrompt, runtimeId);
  return agentSessionDir
    ? { ...commandWithPrompt, agentSessionDir }
    : commandWithPrompt;
};

export const executeChatCommand = async (
  command: RuntimeChatCommand,
  context: ChatRuntimeContext,
): Promise<ChatResult> => {
  const { implementation } = resolveRuntime("chat", command.agentId);
  const runtimeCommand = await prepareRuntimeChatCommand(command);
  const recorder = await BridgeSessionRecorder.create(runtimeCommand);
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
          bridgeSession: recorder.getSessionRecord(),
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

const latestUserMessageContent = (command: RuntimeChatCommand) => {
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

const resolveCommandParentEntryId = (
  storage: BridgeLedgerStorage,
  parentEntryId: string | null | undefined,
) => {
  const normalized = parentEntryId?.trim() || null;
  if (!normalized) {
    return null;
  }
  if (!storage.getEntry(normalized)) {
    throw new Error(`parentEntryId 必须指向当前 bridge ledger 中已存在的 entry：${normalized}`);
  }
  return normalized;
};

const prepareRuntimeChatCommand = async (
  command: RuntimeChatCommand,
): Promise<RuntimeChatCommand> => {
  const userMessage = latestUserMessageContent(command);

  if (command.userMessage?.trim() && command.workspacePath?.trim() && command.sessionRootDir?.trim()) {
    const paths = await resolveBridgeSessionPaths({
      workspacePath: command.workspacePath,
      sessionRootDir: command.sessionRootDir,
    });
    const storage = await BridgeLedgerStorage.openOrCreate({
      filePath: paths.ledgerPath,
      workspacePath: command.workspacePath,
      sessionRootDir: command.sessionRootDir,
    });
    const parentEntryId = resolveCommandParentEntryId(storage, commandParentEntryId(command));
    const contextLeafId = parentEntryId ?? storage.getLeafId();
    const sessionContext = buildBridgeSessionContext(storage, contextLeafId);
    const commandWithRecording = {
      ...command,
      recordUserMessage: shouldRecordRuntimeUserMessage(sessionContext.entries, contextLeafId),
      messages: command.messages ?? [],
    };
    const commandWithTurn = withSessionLink(commandWithRecording, {
      turnId: inferCommandTurnId(commandWithRecording, sessionContext.entries),
    });
    const systemPrompt = composeRuntimeSystemPrompt({
      context: sessionContext,
      currentSystemPrompt: commandWithTurn.systemPrompt,
      includeSummary: true,
    });
    const systemEntry = await appendRuntimeSystemPromptIfNeeded({
      storage,
      command: commandWithTurn,
      context: sessionContext,
      baseLeafId: contextLeafId,
      parentEntryId: contextLeafId,
    });
    const runtimeParentEntryId = systemEntry?.id ?? parentEntryId ?? commandParentEntryId(commandWithTurn);
    const updatedSessionContext = buildBridgeSessionContext(
      storage,
      systemEntry?.id ?? contextLeafId,
    );
    return {
      ...withSessionLink(commandWithTurn, { parentEntryId: runtimeParentEntryId }),
      systemPrompt,
      messages: toRuntimeMessages(
        updatedSessionContext.messages,
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

const isVisibleChatOutputEvent = (command: RuntimeChatCommand, event: BridgeEvent) => {
  if (!command.streamId || !("taskId" in event) || event.taskId !== command.streamId) {
    return false;
  }

  return event.type === BridgeEventType.TextDelta
    || event.type === BridgeEventType.ThinkingDelta
    || event.type === BridgeEventType.ReplaceText
    || event.type === BridgeEventType.ThinkingEnd
    || event.type === BridgeEventType.Done;
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
