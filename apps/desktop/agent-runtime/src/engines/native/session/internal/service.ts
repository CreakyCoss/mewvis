import { rm } from "node:fs/promises";
import {
  AgentResultType,
  type CreateSessionCommand,
  type MessageAppendCommand,
  type MessageDeleteCommand,
  type MessageEditCommand,
  type ReadSessionCommand,
  type RebuildCommand,
  type SessionMutationResult,
  type SessionResult,
  type SummarizeSessionCommand,
} from "../../../protocol/index.js";
import type {
  RuntimeSessionAgentVisibleContextInput,
  RuntimeSessionCompactInput,
  RuntimeSessionDeleteInput,
  RuntimeSessionEventInput,
  RuntimeSessionMutationHooks,
  RuntimeSessionSummarizeOptions,
} from "../providers/types.js";
import type {
  RuntimeSessionStorageProvider,
} from "./storage.js";
import {
  buildRuntimeAgentVisibleContext,
} from "../model/agent-context.js";
import { buildRuntimeSessionContext } from "../model/projection.js";
import type { RuntimeMessageRole } from "../model/ledger.js";
import {
  runtimeLedgerOperationMetadata,
  commandRuntimeMessageMetadata,
} from "../model/metadata.js";
import {
  openRuntimeSessionStorage,
  refreshRuntimeSessionManifest,
} from "./writer.js";

export const runtimeSessionResultFrom = (
  command: { requestId?: string | null; sessionRootDir: string },
  context: ReturnType<typeof buildRuntimeSessionContext>,
): SessionResult => ({
  type: AgentResultType.SessionResult,
  requestId: command.requestId ?? null,
  sessionRootDir: command.sessionRootDir,
  summary: context.summary,
  messages: context.messages.map((message) => ({
    ...message,
    messageRecordId: message.messageRecordId ?? "",
  })),
  requestContexts: context.requestContexts,
  runtimeInstructions: context.runtimeInstructions,
  displaySummary: context.displaySummary,
  displaySummaries: context.displaySummaries,
  runtimeLinks: context.runtimeLinks,
});

export const runtimeSessionMutationResultFrom = (
  command: { requestId?: string | null; sessionRootDir: string },
  context: ReturnType<typeof buildRuntimeSessionContext>,
  extra: Partial<Pick<SessionMutationResult, "messageRecordId" | "messageRecordIds" | "compacted" | "rebuilt" | "displaySummary">> = {},
): SessionMutationResult => ({
  ...runtimeSessionResultFrom(command, context),
  type: AgentResultType.SessionMutationResult,
  ...extra,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const readRuntimeSession = async (
  command: ReadSessionCommand,
  provider: RuntimeSessionStorageProvider,
): Promise<SessionResult> => {
  const handle = await openRuntimeSessionStorage(command, provider);
  const { storage } = handle;
  await refreshRuntimeSessionManifest(handle);
  const context = buildRuntimeSessionContext(storage, storage.getLeafId());
  return runtimeSessionResultFrom(command, context);
};

export const readRuntimeSessionAgentVisibleContext = async (
  input: RuntimeSessionAgentVisibleContextInput,
  provider: RuntimeSessionStorageProvider,
) => {
  const agentRoleId = input.agentRoleId.trim();
  if (!agentRoleId) {
    throw new Error("agentRoleId 不能为空");
  }

  const handle = await openRuntimeSessionStorage(input, provider);
  const { storage } = handle;
  const context = buildRuntimeSessionContext(
    storage,
    input.anchorRecordId?.trim() || storage.getLeafId(),
  );
  return buildRuntimeAgentVisibleContext(context.entries, agentRoleId);
};

const contextViewFrom = ({
  leafId: _leafId,
  entries: _entries,
  ...context
}: ReturnType<typeof buildRuntimeSessionContext>) => context;

export const recordRuntimeSessionEvent = async (
  input: RuntimeSessionEventInput,
  provider: RuntimeSessionStorageProvider,
): Promise<SessionMutationResult> => {
  const eventType = input.eventType.trim();
  if (!eventType) {
    throw new Error("runtime session eventType 不能为空");
  }

  const handle = await openRuntimeSessionStorage(input, provider);
  const { storage } = handle;
  const baseLeafId = storage.getLeafId();
  const metadata = input.metadataSource
    ? runtimeLedgerOperationMetadata({
      source: input.metadataSource,
      baseLeafId,
    })
    : { baseLeafId };
  const payload = isRecord(input.data)
    ? {
      ...metadata,
      ...input.data,
    }
    : {
      ...metadata,
      value: input.data ?? null,
    };
  await storage.appendCustom(eventType, payload);
  const context = buildRuntimeSessionContext(storage);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(input, context, input.result);
};

export const createRuntimeSession = async (
  command: CreateSessionCommand,
  provider: RuntimeSessionStorageProvider,
): Promise<SessionMutationResult> => {
  const handle = await openRuntimeSessionStorage(command, provider);
  const { storage } = handle;
  const baseLeafId = storage.getLeafId();
  let entryId: string | null = null;
  const systemPrompt = command.systemPrompt?.trim();

  if (systemPrompt) {
    const context = buildRuntimeSessionContext(storage);
    const latestSystemPrompt = context.messages
      .filter((message) => message.role === "system")
      .at(-1)?.content.trim() ?? "";
    if (latestSystemPrompt && latestSystemPrompt !== systemPrompt) {
      throw new Error("systemPrompt 已在当前 runtime session 初始化，create_session 不能隐式覆盖；请重建/新建 session。");
    }
    if (!latestSystemPrompt) {
      const entry = await storage.appendMessage({
        role: "system",
        content: systemPrompt,
        timestamp: Date.now(),
        metadata: commandRuntimeMessageMetadata({
          role: "system",
          source: "app_create_session",
          baseLeafId,
          metadata: command.metadata ?? null,
        }),
      });
      entryId = entry.id;
    }
  }

  const context = buildRuntimeSessionContext(storage);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(command, context, {
    messageRecordId: entryId,
    messageRecordIds: entryId ? [entryId] : [],
  });
};

export const summarizeRuntimeSession = async (
  command: SummarizeSessionCommand,
  provider: RuntimeSessionStorageProvider,
  options: RuntimeSessionSummarizeOptions,
): Promise<SessionMutationResult> => {
  const handle = await openRuntimeSessionStorage(command, provider);
  const { storage } = handle;
  const targetLeafId = storage.getLeafId();
  if (!targetLeafId) {
    throw new Error("无法摘要空 runtime session：当前 session 没有可用 leaf");
  }

  const context = buildRuntimeSessionContext(storage, targetLeafId);
  const generated = await options.generateDisplaySummary({
    context: contextViewFrom(context),
    rawContext: context,
    agentId: command.agent?.agentId ?? null,
    runtimeModel: command.runtime?.model ?? null,
    summaryInstruction: command.options?.summaryInstruction ?? null,
    maxSummaryChars: command.options?.maxSummaryChars ?? null,
  });
  await storage.appendCustom("display_summary", {
    ...runtimeLedgerOperationMetadata({
      source: "runtime_display_summary",
      baseLeafId: targetLeafId,
    }),
    displayOnly: true,
    version: 1,
    targetLeafId,
    summary: generated.summary,
    summaryInstruction: command.options?.summaryInstruction ?? null,
    runtimeId: generated.runtimeId,
    modelId: generated.modelId,
    generatedAt: Date.now(),
    sourceCharCount: generated.sourceCharCount,
    chunkCount: generated.chunkCount,
    llmCallCount: generated.llmCallCount,
    messageCount: context.messages.length,
    entryCount: context.entries.length,
  }, targetLeafId);
  await storage.setLeafId(targetLeafId);

  const nextContext = buildRuntimeSessionContext(storage, targetLeafId);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(command, nextContext, {
    displaySummary: nextContext.displaySummary,
  });
};

const normalizeMessageRole = (role: string): RuntimeMessageRole => {
  if (role === "assistant" || role === "system" || role === "user") {
    return role;
  }
  return "user";
};

export const appendRuntimeSessionMessages = async (
  command: MessageAppendCommand,
  provider: RuntimeSessionStorageProvider,
): Promise<SessionMutationResult> => {
  const handle = await openRuntimeSessionStorage(command, provider);
  const { storage } = handle;
  const entryIds: string[] = [];
  const baseLeafId = storage.getLeafId();

  for (const message of command.messages) {
    const content = message.content.trim();
    if (!content) {
      continue;
    }
    const role = normalizeMessageRole(message.role);
    if (role === "system") {
      const context = buildRuntimeSessionContext(storage);
      const latestSystemPrompt = context.messages
        .filter((item) => item.role === "system")
        .at(-1)?.content.trim() ?? "";
      if (latestSystemPrompt && latestSystemPrompt !== content) {
        throw new Error("systemPrompt 已在当前 runtime session 初始化，message_append 不能隐式覆盖；请重建/新建 session。");
      }
      if (latestSystemPrompt === content) {
        continue;
      }
    }
    const entry = await storage.appendMessage({
      role,
      content,
      timestamp: message.timestamp ?? Date.now(),
      metadata: commandRuntimeMessageMetadata({
        role,
        source: "app_append",
        baseLeafId,
        metadata: message.metadata ?? null,
      }),
    });
    entryIds.push(entry.id);
  }

  const context = buildRuntimeSessionContext(storage);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(command, context, {
    messageRecordId: entryIds.at(-1) ?? null,
    messageRecordIds: entryIds,
  });
};

export const rebuildRuntimeSession = async (
  command: RebuildCommand,
  provider: RuntimeSessionStorageProvider,
  hooks: RuntimeSessionMutationHooks = {},
): Promise<SessionMutationResult> => {
  const handle = await openRuntimeSessionStorage(command, provider);
  const { storage } = handle;
  const previousLeafId = storage.getLeafId();
  await storage.setLeafId(null);
  await storage.appendCustom("rebuild_started", {
    ...runtimeLedgerOperationMetadata({
      source: "app_rebuild",
      baseLeafId: previousLeafId,
    }),
    messageCount: command.messages.length,
    previousLeafId,
  });
  const entryIds: string[] = [];

  for (const message of command.messages) {
    const content = message.content.trim();
    if (!content) {
      continue;
    }
    const role = normalizeMessageRole(message.role);
    const entry = await storage.appendMessage({
      role,
      content,
      timestamp: message.timestamp ?? Date.now(),
      metadata: commandRuntimeMessageMetadata({
        role,
        source: "app_rebuild",
        baseLeafId: previousLeafId,
        metadata: message.metadata ?? null,
      }),
    });
    entryIds.push(entry.id);
  }

  const context = buildRuntimeSessionContext(storage);
  await hooks.invalidateDerivedArtifacts?.(command);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(command, context, {
    messageRecordId: entryIds.at(-1) ?? null,
    messageRecordIds: entryIds,
  });
};

export const editRuntimeSessionMessage = async (
  command: MessageEditCommand,
  provider: RuntimeSessionStorageProvider,
  hooks: RuntimeSessionMutationHooks = {},
): Promise<SessionMutationResult> => {
  const handle = await openRuntimeSessionStorage(command, provider);
  const { storage } = handle;
  const target = storage.getEntry(command.messageRecordId);
  if (!target || target.type !== "message") {
    throw new Error(`无法编辑 runtime message，messageRecordId 不存在：${command.messageRecordId}`);
  }

  await storage.setLeafId(target.parentId);
  const replacement = await storage.appendMessage({
    ...target.message,
    content: command.content,
    timestamp: Date.now(),
    metadata: commandRuntimeMessageMetadata({
      role: target.message.role,
      source: "app_edit",
      baseLeafId: target.parentId,
      metadata: {
        ...(target.message.metadata ?? {}),
        editedAt: Date.now(),
        editedFromEntryId: target.id,
      },
    }),
  });
  const context = buildRuntimeSessionContext(storage);
  await hooks.invalidateDerivedArtifacts?.(command);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(command, context, {
    messageRecordId: replacement.id,
  });
};

export const deleteRuntimeSessionMessage = async (
  command: MessageDeleteCommand,
  provider: RuntimeSessionStorageProvider,
  hooks: RuntimeSessionMutationHooks = {},
): Promise<SessionMutationResult> => {
  const handle = await openRuntimeSessionStorage(command, provider);
  const { storage } = handle;
  const target = storage.getEntry(command.messageRecordId);
  if (!target || target.type !== "message") {
    throw new Error(`无法删除 runtime message，messageRecordId 不存在：${command.messageRecordId}`);
  }

  await storage.setLeafId(target.parentId);
  await storage.appendCustom("message_deleted", {
    ...runtimeLedgerOperationMetadata({
      source: "app_delete",
      baseLeafId: target.parentId,
    }),
    deletedEntryId: target.id,
    role: target.message.role,
    contentPreview: target.message.content.slice(0, 240),
  });
  const context = buildRuntimeSessionContext(storage);
  await hooks.invalidateDerivedArtifacts?.(command);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(command, context, {
    messageRecordId: target.id,
  });
};

export const compactRuntimeSessionContent = async (
  input: RuntimeSessionCompactInput,
  provider: RuntimeSessionStorageProvider,
): Promise<SessionMutationResult> => {
  const handle = await openRuntimeSessionStorage(input, provider);
  const { storage } = handle;
  const targetLeafId = storage.getLeafId();
  if (!targetLeafId) {
    throw new Error("无法压缩空 runtime session：当前 session 没有可用 leaf");
  }

  const context = buildRuntimeSessionContext(storage, targetLeafId);
  const summary = input.summary?.trim() || context.displaySummary?.summary.trim() || "";
  if (!summary) {
    throw new Error("无法压缩 runtime session：必须提供 summary，或先生成 displaySummary");
  }

  const entry = await storage.appendBranchSummary(targetLeafId, summary, {
    ...runtimeLedgerOperationMetadata({
      source: "runtime_compact",
      baseLeafId: targetLeafId,
    }),
    details: input.details ?? null,
  });
  const nextContext = buildRuntimeSessionContext(storage, entry.id);
  await refreshRuntimeSessionManifest(handle);
  return runtimeSessionMutationResultFrom(input, nextContext, {
    compacted: true,
    messageRecordId: entry.id,
    messageRecordIds: [entry.id],
  });
};

export const deleteRuntimeSession = async (
  input: RuntimeSessionDeleteInput,
  provider: RuntimeSessionStorageProvider,
) => {
  const paths = await provider.resolvePaths(input);
  await rm(paths.sessionDir, { recursive: true, force: true });
};
