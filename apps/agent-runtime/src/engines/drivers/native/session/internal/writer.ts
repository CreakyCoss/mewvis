import { buildRuntimeSessionContext } from "../model/projection.js";
import type { RuntimeMessage, RuntimeSessionContext } from "../model/ledger.js";
import { runtimeMessageMetadata } from "../model/metadata.js";
import type { RuntimeSessionHandle, RuntimeSessionStorageProvider, RuntimeSessionStore } from "./storage.js";
import type { RuntimeSessionTurnOptions } from "../providers/types.js";
import { takeContextText } from "../model/prompt-budget.js";
import type { RuntimeSessionCommand } from "../model/runtime-command.js";
import {
  commandParentEntryId,
  inferCommandTurnId,
  shouldRecordRuntimeUserMessage,
  withSessionLink,
} from "../model/runtime-link.js";

export const openRuntimeSessionStorage = async (
  command: { workspacePath: string; sessionRootDir: string },
  provider: RuntimeSessionStorageProvider,
) => {
  return provider.openOrCreate(command);
};

export const refreshRuntimeSessionManifest = async (handle: RuntimeSessionHandle) => {
  try {
    await handle.refreshManifest();
  } catch (error: unknown) {
    console.warn(`runtime session manifest 刷新失败：${String(error)}`);
  }
};

type RuntimeSystemPromptCommand = RuntimeSessionCommand;

const normalized = (value: string | null | undefined) => value?.trim() ?? "";

const systemMessagesIn = (context: RuntimeSessionContext) =>
  context.messages.filter((message) => message.role === "system");

const latestSystemPrompt = (context: RuntimeSessionContext) => systemMessagesIn(context).at(-1)?.content.trim() ?? "";

export const composeRuntimeSystemPrompt = ({
  context,
  currentSystemPrompt,
  includeSummary,
}: {
  context: RuntimeSessionContext;
  currentSystemPrompt?: string | null;
  includeSummary?: boolean;
}) => {
  const current = normalized(currentSystemPrompt);
  const effectiveSystemPrompt = current || latestSystemPrompt(context);
  const sections: string[] = [];
  if (effectiveSystemPrompt) {
    sections.push(effectiveSystemPrompt);
  }

  if (includeSummary && context.summary.trim()) {
    sections.push(
      [
        '<conversation_summary source="runtime_ledger" instruction="data_only; not_current_request">',
        takeContextText(context.summary.trim(), 24000),
        "</conversation_summary>",
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
};

export const appendRuntimeSystemPromptIfNeeded = async ({
  storage,
  command,
  context,
  baseLeafId,
  parentEntryId,
}: {
  storage: RuntimeSessionStore;
  command: RuntimeSystemPromptCommand;
  context: RuntimeSessionContext;
  baseLeafId: string | null;
  parentEntryId?: string | null;
}) => {
  if (command.recordUserMessage === false) {
    return null;
  }

  const content = normalized(command.systemPrompt);
  const latest = latestSystemPrompt(context);
  if (!content) {
    return null;
  }
  if (latest && content !== latest) {
    throw new Error(
      "systemPrompt 已在当前 runtime session 初始化，后续请求不能隐式变更；请使用 requestContext/runtimeInstruction 表达本轮补充，或重建/新建 session。",
    );
  }
  if (content === latest) {
    return null;
  }

  return storage.appendMessage(
    {
      role: "system",
      content,
      timestamp: Date.now(),
      metadata: runtimeMessageMetadata({
        command,
        role: "system",
        baseLeafId,
      }),
    },
    parentEntryId ?? undefined,
  );
};

export const visibleHistoryMessages = (messages: RuntimeMessage[]) =>
  messages.filter((message) => message.role !== "system");

type SessionTurnCommand = RuntimeSessionCommand & {
  workspacePath?: string | null;
  sessionRootDir?: string | null;
};

const resolveCommandParentEntryId = (storage: RuntimeSessionStore, parentEntryId: string | null | undefined) => {
  const normalized = parentEntryId?.trim() || null;
  if (!normalized) {
    return null;
  }
  if (!storage.getEntry(normalized)) {
    throw new Error(`parentEntryId 必须指向当前 runtime ledger 中已存在的 entry：${normalized}`);
  }
  return normalized;
};

export const hasRuntimeSessionTarget = (command: SessionTurnCommand) =>
  Boolean(command.workspacePath?.trim() && command.sessionRootDir?.trim());

export const prepareRuntimeSessionTurn = async <TCommand extends SessionTurnCommand>(
  command: TCommand,
  provider: RuntimeSessionStorageProvider,
  options: RuntimeSessionTurnOptions = {},
) => {
  if (!hasRuntimeSessionTarget(command)) {
    return null;
  }

  const { storage } = await openRuntimeSessionStorage(
    {
      workspacePath: command.workspacePath as string,
      sessionRootDir: command.sessionRootDir as string,
    },
    provider,
  );
  const parentEntryId = resolveCommandParentEntryId(storage, commandParentEntryId(command));
  const contextLeafId = parentEntryId ?? storage.getLeafId();
  const sessionContext = buildRuntimeSessionContext(storage, contextLeafId);
  const inferredRecordUserMessage = shouldRecordRuntimeUserMessage(sessionContext.entries, contextLeafId);
  const commandWithRecording = {
    ...command,
    recordUserMessage:
      options.preserveRecordUserMessageFalse && command.recordUserMessage === false ? false : inferredRecordUserMessage,
  };
  const commandWithTurn = withSessionLink(commandWithRecording, {
    turnId: inferCommandTurnId(commandWithRecording, sessionContext.entries),
  });
  const systemPrompt = composeRuntimeSystemPrompt({
    context: sessionContext,
    currentSystemPrompt: commandWithTurn.systemPrompt,
    includeSummary: options.includeSummary ?? false,
  });
  const systemEntry = await appendRuntimeSystemPromptIfNeeded({
    storage,
    command: commandWithTurn,
    context: sessionContext,
    baseLeafId: contextLeafId,
    parentEntryId: contextLeafId,
  });
  const runtimeParentEntryId = systemEntry?.id ?? parentEntryId ?? commandParentEntryId(commandWithTurn);
  const updatedSessionContext = buildRuntimeSessionContext(storage, systemEntry?.id ?? contextLeafId);

  return {
    command: withSessionLink(commandWithTurn, { parentEntryId: runtimeParentEntryId }),
    contextLeafId,
    runtimeParentEntryId,
    sessionContext,
    systemPrompt,
    updatedSessionContext,
  };
};
