import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type {
  CompactCommand,
  RebuildAgentSessionCommand,
  SessionMutationResult,
} from "../../../protocol/index.js";
import { buildRuntimeSessionContext } from "../../session/model/projection.js";
import { runtimeLedgerOperationMetadata } from "../../session/model/metadata.js";
import { createRuntimeSessionManager } from "../../session/index.js";
import {
  runtimeSessionMutationResultFrom,
} from "../../session/service.js";
import { resolveRuntime } from "../runtimes/resolver.js";
import type {
  AgentRunCommand,
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
} from "../runtimes/types.js";
import {
  createAgentSessionPlan,
  resolveAgentSessionDir,
} from "./artifacts.js";
import { prepareRuntimeAgentPrompt } from "./prompt.js";

const fallbackRuntimeContext: AgentRuntimeContext = {
  callbacks: {
    requestUserInput: async () => "",
  },
  emit: () => {},
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

export const compactRuntimeSession = async (
  command: CompactCommand,
  runtimeContext?: AgentRuntimeContext,
): Promise<SessionMutationResult> => {
  const sessionManager = createRuntimeSessionManager(command);
  const handle = await sessionManager.openHandle();
  const { storage } = handle;
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
    taskId: command.requestId?.trim() || `runtime-compact-${randomUUID()}`,
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
    ? await implementation.compact(compactCommand, runtimeContext ?? fallbackRuntimeContext)
    : {
      compacted: false,
      message: `${runtimeId} agent runtime 不支持手动压缩`,
    };

  await storage.appendCustom("agent_session_compacted", {
    ...runtimeLedgerOperationMetadata({
      source: "runtime_compact",
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
  const context = buildRuntimeSessionContext(storage);
  await sessionManager.refreshManifest(handle);
  return runtimeSessionMutationResultFrom(command, context, {
    compacted: compactResult.compacted,
  });
};

export const rebuildRuntimeAgentSession = async (
  command: RebuildAgentSessionCommand,
  runtimeContext?: AgentRuntimeContext,
): Promise<SessionMutationResult> => {
  const sessionManager = createRuntimeSessionManager(command);
  const handle = await sessionManager.openHandle();
  const { storage } = handle;
  const baseLeafId = storage.getLeafId();
  const { runtimeId, implementation } = resolveRuntime("agent", command.target.agentId);
  const sessionPlan = await createAgentSessionPlan({
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
    runtimeId,
    agentRoleId: command.target.agentRoleId,
  });
  await rm(sessionPlan.agentSessionDir, { recursive: true, force: true });

  const taskId = command.requestId?.trim() || `runtime-rebuild-agent-session-${randomUUID()}`;
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
  const runtimeCommandWithPrompt = await prepareRuntimeAgentPrompt(rebuildCommand, runtimeId);
  const agentSessionDir = await resolveAgentSessionDir(runtimeCommandWithPrompt, runtimeId);
  const runtimeCommand = agentSessionDir
    ? { ...runtimeCommandWithPrompt, agentSessionDir }
    : runtimeCommandWithPrompt;
  const result = await implementation.run(runtimeCommand, runtimeContext ?? fallbackRuntimeContext);

  await storage.appendCustom("agent_session_rebuilt", {
    ...runtimeLedgerOperationMetadata({
      source: "runtime_rebuild_agent_session",
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
  const context = buildRuntimeSessionContext(storage);
  await sessionManager.refreshManifest(handle);
  return runtimeSessionMutationResultFrom(command, context, {
    rebuilt: true,
  });
};
