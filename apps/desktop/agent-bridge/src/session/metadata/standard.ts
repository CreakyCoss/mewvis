import type {
  BridgeMessageActorType,
  BridgeMessageMetadata,
  BridgeMessageRole,
  BridgeMessageScope,
  BridgeMessageSource,
} from "../core/types.js";

type AgentSessionRef = {
  runtimeId: string | null;
  agentRoleId: string | null;
};

type StandardMetadataInput = {
  role: BridgeMessageRole;
  source: BridgeMessageSource;
  scope?: BridgeMessageScope;
  metadata?: Record<string, unknown> | null;
  actorType?: BridgeMessageActorType;
  runtimeId?: string | null;
  agentRoleId?: string | null;
  agentSessionId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  streamId?: string | null;
  turnId?: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  recordUserMessage?: boolean | null;
  baseLeafId?: string | null;
  parentUserEntryId?: string | null;
  runStatus?: "done" | "error";
  thinking?: string | null;
};

const actorTypeForRole = (role: BridgeMessageRole): BridgeMessageActorType => {
  if (role === "assistant") {
    return "agent";
  }
  if (role === "system") {
    return "system";
  }
  return "user";
};

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const parseAgentSessionId = (agentSessionId?: string | null): AgentSessionRef => {
  const segments = (agentSessionId ?? "")
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const agentsIndex = segments.lastIndexOf("agents");
  if (agentsIndex < 0) {
    if (segments.length >= 2) {
      return {
        runtimeId: segments[0] ?? null,
        agentRoleId: segments[1] ?? null,
      };
    }

    return {
      runtimeId: null,
      agentRoleId: null,
    };
  }

  return {
    runtimeId: segments[agentsIndex + 1] ?? null,
    agentRoleId: segments[agentsIndex + 2] ?? null,
  };
};

export const standardizeBridgeMessageMetadata = ({
  role,
  source,
  scope = "shared",
  metadata,
  actorType,
  runtimeId,
  agentRoleId,
  agentSessionId,
  runId,
  taskId,
  streamId,
  turnId,
  parentEntryId,
  rootUserEntryId,
  recordUserMessage,
  baseLeafId,
  parentUserEntryId,
  runStatus,
  thinking,
}: StandardMetadataInput): BridgeMessageMetadata => {
  const {
    agentSessionDir: _discardAgentSessionDir,
    agentSessionRunId: _discardAgentSessionRunId,
    ...existing
  } = (metadata ?? {}) as BridgeMessageMetadata & {
    agentSessionDir?: unknown;
    agentSessionRunId?: unknown;
  };
  const existingSessionId = agentSessionId ?? stringOrNull(existing.agentSessionId);
  const parsedSession = parseAgentSessionId(existingSessionId);
  const existingAgentRoleId = stringOrNull(existing.agentRoleId) ?? stringOrNull(existing.agentKey);
  const normalizedAgentRoleId = agentRoleId ?? parsedSession.agentRoleId ?? existingAgentRoleId;
  const normalizedRuntimeId = runtimeId
    ?? parsedSession.runtimeId
    ?? stringOrNull(existing.runtimeId)
    ?? stringOrNull(existing.runtimeAgentId);

  return {
    ...existing,
    bridgeMetadataVersion: 1,
    actorType: actorType ?? existing.actorType ?? actorTypeForRole(role),
    source,
    scope,
    runtimeId: normalizedRuntimeId,
    runtimeAgentId: normalizedRuntimeId ?? stringOrNull(existing.runtimeAgentId),
    agentRoleId: normalizedAgentRoleId,
    agentKey: normalizedAgentRoleId,
    agentSessionId: existingSessionId,
    runId: runId ?? stringOrNull(existing.runId),
    taskId: taskId ?? stringOrNull(existing.taskId),
    streamId: streamId ?? stringOrNull(existing.streamId),
    turnId: turnId ?? stringOrNull(existing.turnId),
    parentEntryId: parentEntryId ?? stringOrNull(existing.parentEntryId),
    rootUserEntryId: rootUserEntryId ?? stringOrNull(existing.rootUserEntryId),
    recordUserMessage: recordUserMessage ?? (
      typeof existing.recordUserMessage === "boolean" ? existing.recordUserMessage : null
    ),
    baseLeafId: baseLeafId ?? stringOrNull(existing.baseLeafId),
    parentUserEntryId: parentUserEntryId ?? stringOrNull(existing.parentUserEntryId),
    ...(runStatus ? { runStatus } : {}),
    ...(thinking !== undefined ? { thinking } : {}),
  };
};
