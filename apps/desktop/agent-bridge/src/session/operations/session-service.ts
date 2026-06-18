import {
  BridgeResultType,
  type CompactCommand,
  type CreateSessionCommand,
  type MessageAppendCommand,
  type MessageDeleteCommand,
  type MessageEditCommand,
  type ReadSessionCommand,
  type RebuildCommand,
  type SessionMutationResult,
  type SessionResult,
} from "../../contracts/protocol.js";
import { rm } from "node:fs/promises";
import { compactBridgeLedger } from "../core/compaction.js";
import { BridgeLedgerStorage } from "../storage/jsonl-store.js";
import { resolveBridgeSessionPaths } from "../storage/paths.js";
import { buildBridgeSessionContext } from "../core/projection.js";
import { writeBridgeContextCache } from "../storage/context-cache.js";
import type { BridgeMessageRole } from "../core/types.js";
import {
  bridgeLedgerOperationMetadata,
  commandBridgeMessageMetadata,
} from "../metadata/app.js";

const openSessionStorage = async (
  command: { workspacePath: string; sessionRootDir: string },
) => {
  const paths = await resolveBridgeSessionPaths(command);
  const storage = await BridgeLedgerStorage.openOrCreate({
    filePath: paths.ledgerPath,
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
  });

  return { paths, storage };
};

const invalidateBridgeAgentSessionCache = async (
  paths: { agentsDir: string },
) => {
  await rm(paths.agentsDir, { recursive: true, force: true });
};

const sessionResultFrom = (
  command: { requestId?: string | null; sessionRootDir: string },
  context: ReturnType<typeof buildBridgeSessionContext>,
): SessionResult => ({
  type: BridgeResultType.SessionResult,
  requestId: command.requestId ?? null,
  sessionRootDir: command.sessionRootDir,
  summary: context.summary,
  messages: context.messages,
  requestContexts: context.requestContexts,
  runtimeInstructions: context.runtimeInstructions,
});

const mutationResultFrom = (
  command: { requestId?: string | null; sessionRootDir: string },
  context: ReturnType<typeof buildBridgeSessionContext>,
  extra: Pick<SessionMutationResult, "messageRecordId" | "messageRecordIds" | "compacted"> = {},
): SessionMutationResult => ({
  ...sessionResultFrom(command, context),
  type: BridgeResultType.SessionMutationResult,
  ...extra,
});

export const readBridgeSession = async (
  command: ReadSessionCommand,
): Promise<SessionResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const context = buildBridgeSessionContext(storage, storage.getLeafId());
  await writeBridgeContextCache(paths.contextPath, context);
  return sessionResultFrom(command, context);
};

export const createBridgeSession = async (
  command: CreateSessionCommand,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const baseLeafId = storage.getLeafId();
  let entryId: string | null = null;
  const systemPrompt = command.systemPrompt?.trim();

  if (systemPrompt) {
    const context = buildBridgeSessionContext(storage);
    const latestSystemPrompt = context.messages
      .filter((message) => message.role === "system")
      .at(-1)?.content.trim() ?? "";
    if (latestSystemPrompt && latestSystemPrompt !== systemPrompt) {
      throw new Error("systemPrompt 已在当前 bridge session 初始化，create_session 不能隐式覆盖；请重建/新建 session。");
    }
    if (!latestSystemPrompt) {
      const entry = await storage.appendMessage({
        role: "system",
        content: systemPrompt,
        timestamp: Date.now(),
        metadata: commandBridgeMessageMetadata({
          role: "system",
          source: "app_create_session",
          baseLeafId,
          metadata: command.metadata ?? null,
        }),
      });
      entryId = entry.id;
    }
  }

  const context = buildBridgeSessionContext(storage);
  await writeBridgeContextCache(paths.contextPath, context);
  return mutationResultFrom(command, context, {
    messageRecordId: entryId,
    messageRecordIds: entryId ? [entryId] : [],
  });
};

export const compactBridgeSession = async (
  command: CompactCommand,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const baseLeafId = storage.getLeafId();
  if (command.target.scope !== "shared") {
    throw new Error(`compact 暂仅支持 shared bridge ledger：${command.target.scope}`);
  }
  const result = await compactBridgeLedger(storage, {
    contextPath: paths.contextPath,
    keepRecentMessages: command.options?.keepRecentMessages ?? undefined,
    metadata: bridgeLedgerOperationMetadata({
      source: "bridge_compact",
      baseLeafId,
      keepRecentMessages: command.options?.keepRecentMessages ?? null,
    }),
  });

  return mutationResultFrom(command, result.context, {
    compacted: result.compacted,
  });
};

const normalizeMessageRole = (role: string): BridgeMessageRole => {
  if (role === "assistant" || role === "system" || role === "user") {
    return role;
  }
  return "user";
};

export const appendBridgeSessionMessages = async (
  command: MessageAppendCommand,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const entryIds: string[] = [];
  const baseLeafId = storage.getLeafId();

  for (const message of command.messages) {
    const content = message.content.trim();
    if (!content) {
      continue;
    }
    const role = normalizeMessageRole(message.role);
    if (role === "system") {
      const context = buildBridgeSessionContext(storage);
      const latestSystemPrompt = context.messages
        .filter((item) => item.role === "system")
        .at(-1)?.content.trim() ?? "";
      if (latestSystemPrompt && latestSystemPrompt !== content) {
        throw new Error("systemPrompt 已在当前 bridge session 初始化，message_append 不能隐式覆盖；请重建/新建 session。");
      }
      if (latestSystemPrompt === content) {
        continue;
      }
    }
    const entry = await storage.appendMessage({
      role,
      content,
      timestamp: message.timestamp ?? Date.now(),
      metadata: commandBridgeMessageMetadata({
        role,
        source: "app_append",
        baseLeafId,
        metadata: message.metadata ?? null,
      }),
    });
    entryIds.push(entry.id);
  }

  const context = buildBridgeSessionContext(storage);
  await writeBridgeContextCache(paths.contextPath, context);
  return mutationResultFrom(command, context, {
    messageRecordId: entryIds.at(-1) ?? null,
    messageRecordIds: entryIds,
  });
};

export const rebuildBridgeSession = async (
  command: RebuildCommand,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const previousLeafId = storage.getLeafId();
  await storage.setLeafId(null);
  await storage.appendCustom("rebuild_started", {
    ...bridgeLedgerOperationMetadata({
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
      metadata: commandBridgeMessageMetadata({
        role,
        source: "app_rebuild",
        baseLeafId: previousLeafId,
        metadata: message.metadata ?? null,
      }),
    });
    entryIds.push(entry.id);
  }

  const context = buildBridgeSessionContext(storage);
  await writeBridgeContextCache(paths.contextPath, context);
  await invalidateBridgeAgentSessionCache(paths);
  return mutationResultFrom(command, context, {
    messageRecordId: entryIds.at(-1) ?? null,
    messageRecordIds: entryIds,
  });
};

export const editBridgeSessionMessage = async (
  command: MessageEditCommand,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const target = storage.getEntry(command.messageRecordId);
  if (!target || target.type !== "message") {
    throw new Error(`无法编辑 bridge message，messageRecordId 不存在：${command.messageRecordId}`);
  }

  await storage.setLeafId(target.parentId);
  const replacement = await storage.appendMessage({
    ...target.message,
    content: command.content,
    timestamp: Date.now(),
    metadata: commandBridgeMessageMetadata({
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
  const context = buildBridgeSessionContext(storage);
  await writeBridgeContextCache(paths.contextPath, context);
  await invalidateBridgeAgentSessionCache(paths);
  return mutationResultFrom(command, context, {
    messageRecordId: replacement.id,
  });
};

export const deleteBridgeSessionMessage = async (
  command: MessageDeleteCommand,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const target = storage.getEntry(command.messageRecordId);
  if (!target || target.type !== "message") {
    throw new Error(`无法删除 bridge message，messageRecordId 不存在：${command.messageRecordId}`);
  }

  await storage.setLeafId(target.parentId);
  await storage.appendCustom("message_deleted", {
    ...bridgeLedgerOperationMetadata({
      source: "app_delete",
      baseLeafId: target.parentId,
    }),
    deletedEntryId: target.id,
    role: target.message.role,
    contentPreview: target.message.content.slice(0, 240),
  });
  const context = buildBridgeSessionContext(storage);
  await writeBridgeContextCache(paths.contextPath, context);
  await invalidateBridgeAgentSessionCache(paths);
  return mutationResultFrom(command, context, {
    messageRecordId: target.id,
  });
};
