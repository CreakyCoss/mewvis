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
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolveRuntime } from "../../runtimes/resolver.js";
import type {
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
} from "../../runtimes/types.js";
import { createAgentSessionPlan } from "../runtime/agent/session-plan.js";
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
  runtimeContext?: AgentRuntimeContext,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const baseLeafId = storage.getLeafId();
  const { runtimeId, implementation } = resolveRuntime("agent", command.target.agentId);
  const sessionPlan = await createAgentSessionPlan({
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
    runtimeId,
    agentRoleId: command.target.agentRoleId,
  });
  const compactCommand: RuntimeAgentCompactCommand = {
    runtimeMode: "agent",
    requestId: command.requestId ?? null,
    agentId: command.target.agentId ?? runtimeId,
    taskId: command.requestId?.trim() || `bridge-compact-${randomUUID()}`,
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
    agentRoleId: sessionPlan.agentRoleId,
    userMessage: "",
    recordUserMessage: false,
    systemPrompt: null,
    requestContext: null,
    runtimeInstruction: null,
    runtimeModel: command.runtime?.model ?? null,
    resources: command.runtime?.resources ?? null,
    sessionLink: null,
    agentTaskPrompt: "",
    sessionBootstrapContext: null,
    agentSessionDir: sessionPlan.agentSessionDir,
    compactInstructions: command.options?.compactInstruction ?? null,
  };
  const compactResult = implementation.compact
    ? await implementation.compact(compactCommand, runtimeContext ?? {
      askUser: async () => "",
      emit: () => {},
    })
    : {
      compacted: false,
      message: `${runtimeId} agent runtime 不支持手动压缩`,
    };

  await storage.appendCustom("agent_session_compacted", {
    ...bridgeLedgerOperationMetadata({
      source: "bridge_compact",
      baseLeafId,
    }),
    target: {
      scope: command.target.scope,
      runtimeId,
      agentRoleId: sessionPlan.agentRoleId,
      agentSessionId: sessionPlan.agentSessionId,
    },
    compacted: compactResult.compacted,
    message: compactResult.message ?? null,
    details: compactResult.details ?? null,
  });
  const context = buildBridgeSessionContext(storage);
  await writeBridgeContextCache(paths.contextPath, context);
  return mutationResultFrom(command, context, {
    compacted: compactResult.compacted,
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
