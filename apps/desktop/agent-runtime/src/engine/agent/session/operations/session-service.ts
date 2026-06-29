import {
  BridgeResultType,
  type CompactCommand,
  type CreateSessionCommand,
  type MessageAppendCommand,
  type MessageDeleteCommand,
  type MessageEditCommand,
  type ReadSessionCommand,
  type RebuildAgentSessionCommand,
  type RebuildCommand,
  type SummarizeSessionCommand,
} from "../../contracts/protocol.js";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolveRuntime } from "../../runtimes/resolver.js";
import type {
  AgentRunCommand,
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
} from "../../runtimes/types.js";
import {
  createAgentSessionPlan,
  resolveAgentSessionDir,
} from "../runtime/agent/session-plan.js";
import { prepareBridgeRuntimeAgentPrompt } from "../runtime/agent/prompt.js";
import { BridgeLedgerStorage } from "../../../../session/storage/jsonl-store.js";
import { resolveBridgeSessionPaths } from "../../../../session/storage/paths.js";
import {
  refreshRuntimeSessionManifest,
} from "../../../../session/manifest/session-manifest.js";
import { buildBridgeSessionContext } from "../../../../session/core/projection.js";
import type { BridgeMessageRole } from "../../../../session/core/types.js";
import {
  bridgeLedgerOperationMetadata,
  commandBridgeMessageMetadata,
} from "../metadata/app.js";
import type {
  SessionMutationResult,
  SessionResult,
} from "../../../../session/contracts/results.js";
import { generateDisplaySummary } from "./display-summary.js";

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

const refreshSessionManifest = async (
  command: { workspacePath: string; sessionRootDir: string },
  paths: { ledgerPath: string; tracePath: string },
  storage: BridgeLedgerStorage,
) => {
  try {
    await refreshRuntimeSessionManifest({
      workspacePath: command.workspacePath,
      sessionRootDir: command.sessionRootDir,
      ledgerPath: paths.ledgerPath,
      tracePath: paths.tracePath,
      ledger: storage,
    });
  } catch (error: unknown) {
    console.warn(`runtime session manifest 刷新失败：${String(error)}`);
  }
};

const invalidateBridgeAgentSessionCache = async (
  paths: { agentsDir: string },
) => {
  await rm(paths.agentsDir, { recursive: true, force: true });
};

const defaultAgentSessionRebuildInstruction = [
  "你正在重建这个 runtime session 中某个 agentRoleId 对应的底层长期 Agent session。",
  "只吸收 session_bootstrap_context 中的历史事实、角色状态、关系、任务、约束和重要偏好；不要推进剧情，不要新增事实，不要把这次内部重建当作用户的新请求。",
  "完成后用一句话说明已完成重建。",
].join("\n");

const defaultAgentSessionRebuildMessage = [
  "请基于上方 runtime ledger bootstrap context 重建你的长期角色知识。",
  "这是内部维护任务，不要推进剧情或执行新行动。",
].join("\n");

const sessionResultFrom = (
  command: { requestId?: string | null; sessionRootDir: string },
  context: ReturnType<typeof buildBridgeSessionContext>,
): SessionResult => ({
  type: BridgeResultType.SessionResult,
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

const mutationResultFrom = (
  command: { requestId?: string | null; sessionRootDir: string },
  context: ReturnType<typeof buildBridgeSessionContext>,
  extra: Pick<SessionMutationResult, "messageRecordId" | "messageRecordIds" | "compacted" | "rebuilt" | "displaySummary"> = {},
): SessionMutationResult => ({
  ...sessionResultFrom(command, context),
  type: BridgeResultType.SessionMutationResult,
  ...extra,
});

export const readBridgeSession = async (
  command: ReadSessionCommand,
): Promise<SessionResult> => {
  const { paths, storage } = await openSessionStorage(command);
  await refreshSessionManifest(command, paths, storage);
  const context = buildBridgeSessionContext(storage, storage.getLeafId());
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
      throw new Error("systemPrompt 已在当前 runtime session 初始化，create_session 不能隐式覆盖；请重建/新建 session。");
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
  await refreshSessionManifest(command, paths, storage);
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
      callbacks: {
        requestUserInput: async () => "",
      },
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
  await refreshSessionManifest(command, paths, storage);
  return mutationResultFrom(command, context, {
    compacted: compactResult.compacted,
  });
};

export const rebuildBridgeAgentSession = async (
  command: RebuildAgentSessionCommand,
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
  await rm(sessionPlan.agentSessionDir, { recursive: true, force: true });

  const taskId = command.requestId?.trim() || `bridge-rebuild-agent-session-${randomUUID()}`;
  const rebuildCommand: AgentRunCommand = {
    runtimeMode: "agent",
    requestId: command.requestId ?? null,
    agentId: command.target.agentId ?? runtimeId,
    taskId,
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
    agentRoleId: sessionPlan.agentRoleId,
    userMessage: command.options?.userMessage?.trim() || defaultAgentSessionRebuildMessage,
    recordUserMessage: false,
    systemPrompt: null,
    requestContext: null,
    runtimeInstruction: null,
    bootstrapInstruction: command.options?.rebuildInstruction?.trim() ||
      defaultAgentSessionRebuildInstruction,
    runtimeModel: command.runtime?.model ?? null,
    resources: command.runtime?.resources ?? null,
  };
  const runtimeCommandWithPrompt = await prepareBridgeRuntimeAgentPrompt(rebuildCommand, runtimeId);
  const agentSessionDir = await resolveAgentSessionDir(runtimeCommandWithPrompt, runtimeId);
  const runtimeCommand = agentSessionDir
    ? { ...runtimeCommandWithPrompt, agentSessionDir }
    : runtimeCommandWithPrompt;
  const result = await implementation.run(runtimeCommand, runtimeContext ?? {
    callbacks: {
      requestUserInput: async () => "",
    },
    emit: () => {},
  });

  await storage.appendCustom("agent_session_rebuilt", {
    ...bridgeLedgerOperationMetadata({
      source: "bridge_rebuild_agent_session",
      baseLeafId,
    }),
    target: {
      scope: command.target.scope,
      runtimeId,
      agentRoleId: sessionPlan.agentRoleId,
      agentSessionId: sessionPlan.agentSessionId,
    },
    rebuilt: true,
    message: result.text?.trim() || null,
    details: {
      taskId,
      bootstrapContextChars: runtimeCommand.sessionBootstrapContext?.length ?? 0,
    },
  });
  const context = buildBridgeSessionContext(storage);
  await refreshSessionManifest(command, paths, storage);
  return mutationResultFrom(command, context, {
    rebuilt: true,
  });
};

export const summarizeBridgeSession = async (
  command: SummarizeSessionCommand,
): Promise<SessionMutationResult> => {
  const { paths, storage } = await openSessionStorage(command);
  const targetLeafId = storage.getLeafId();
  if (!targetLeafId) {
    throw new Error("无法摘要空 runtime session：当前 session 没有可用 leaf");
  }

  const context = buildBridgeSessionContext(storage, targetLeafId);
  const generated = await generateDisplaySummary({
    context,
    agentId: command.agent?.agentId ?? null,
    runtimeModel: command.runtime?.model ?? null,
    summaryInstruction: command.options?.summaryInstruction ?? null,
    maxSummaryChars: command.options?.maxSummaryChars ?? null,
  });
  await storage.appendCustom("display_summary", {
    ...bridgeLedgerOperationMetadata({
      source: "bridge_display_summary",
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

  const nextContext = buildBridgeSessionContext(storage, targetLeafId);
  await refreshSessionManifest(command, paths, storage);
  return mutationResultFrom(command, nextContext, {
    displaySummary: nextContext.displaySummary,
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
  await refreshSessionManifest(command, paths, storage);
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
  await invalidateBridgeAgentSessionCache(paths);
  await refreshSessionManifest(command, paths, storage);
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
    throw new Error(`无法编辑 runtime message，messageRecordId 不存在：${command.messageRecordId}`);
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
  await invalidateBridgeAgentSessionCache(paths);
  await refreshSessionManifest(command, paths, storage);
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
    throw new Error(`无法删除 runtime message，messageRecordId 不存在：${command.messageRecordId}`);
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
  await invalidateBridgeAgentSessionCache(paths);
  await refreshSessionManifest(command, paths, storage);
  return mutationResultFrom(command, context, {
    messageRecordId: target.id,
  });
};
