import type {
  RuntimeMessageActorType,
  RuntimeMessageMetadata,
  RuntimeMessageRole,
  RuntimeMessageScope,
  RuntimeMessageSource,
} from "./ledger.js";
import {
  commandParentEntryId,
  commandRootUserEntryId,
  commandTurnId,
} from "./runtime-link.js";
import type {
  RuntimeAgentSessionCommand,
  RuntimeSessionCommand,
} from "./runtime-command.js";
import { isRuntimeAgentSessionCommand } from "./runtime-command.js";

type AgentSessionRef = {
  runtimeId: string | null;
  agentRoleId: string | null;
};

type StandardMetadataInput = {
  role: RuntimeMessageRole;
  source: RuntimeMessageSource;
  scope?: RuntimeMessageScope;
  metadata?: Record<string, unknown> | null;
  actorType?: RuntimeMessageActorType;
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

const actorTypeForRole = (role: RuntimeMessageRole): RuntimeMessageActorType => {
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

export const standardizeRuntimeMessageMetadata = ({
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
}: StandardMetadataInput): RuntimeMessageMetadata => {
  const {
    agentSessionDir: _discardAgentSessionDir,
    agentSessionRunId: _discardAgentSessionRunId,
    ...existing
  } = (metadata ?? {}) as RuntimeMessageMetadata & {
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
    runtimeMetadataVersion: 1,
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

export const commandRuntimeMessageMetadata = (input: {
  role: RuntimeMessageRole;
  source: Extract<RuntimeMessageSource, "app_create_session" | "app_append" | "app_rebuild" | "app_edit">;
  baseLeafId: string | null;
  metadata?: Record<string, unknown> | null;
}) =>
  standardizeRuntimeMessageMetadata({
    role: input.role,
    source: input.source,
    baseLeafId: input.baseLeafId,
    metadata: input.metadata,
  });

export const runtimeLedgerOperationMetadata = (input: {
  source: RuntimeMessageSource;
  baseLeafId: string | null;
  [key: string]: unknown;
}) => ({
  ...input,
  runtimeMetadataVersion: 1,
  actorType: "runtime" satisfies RuntimeMessageActorType,
  scope: "shared" satisfies RuntimeMessageScope,
});

type RuntimeCommand = RuntimeSessionCommand;

const isAgentRunCommand = (command: RuntimeCommand): command is RuntimeAgentSessionCommand =>
  isRuntimeAgentSessionCommand(command);

const sanitizeSegment = (value: string | null | undefined): string | null => {
  const segment = (value ?? "")
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || null;
};

const runtimeCommandRef = (command: RuntimeCommand) => {
  if (isAgentRunCommand(command)) {
    const runtimeId = sanitizeSegment(command.agentId ?? null);
    const agentRoleId = sanitizeSegment(command.agentRoleId ?? null);
    const agentSessionId = runtimeId && agentRoleId ? `${runtimeId}/${agentRoleId}` : null;
    return {
      runtimeId,
      agentRoleId,
      agentSessionId,
      runId: command.taskId,
      taskId: command.taskId,
      streamId: null,
    };
  }

  return {
    runtimeId: command.agentId ?? null,
    agentRoleId: null,
    agentSessionId: null,
    runId: command.streamId ?? command.requestId ?? null,
    taskId: null,
    streamId: command.streamId ?? null,
  };
};

export const runtimeMessageMetadata = (input: {
  command: RuntimeCommand;
  role: RuntimeMessageRole;
  baseLeafId: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  parentUserEntryId?: string | null;
  runStatus?: "done" | "error";
  thinking?: string | null;
}) => {
  const runtimeRef = runtimeCommandRef(input.command);
  return standardizeRuntimeMessageMetadata({
    role: input.role,
    source: "runtime",
    baseLeafId: input.baseLeafId,
    metadata: {
      runtime: "runtimeMode" in input.command ? "agent" : "chat",
    },
    turnId: commandTurnId(input.command),
    parentEntryId: input.parentEntryId ?? commandParentEntryId(input.command),
    rootUserEntryId: input.rootUserEntryId ?? commandRootUserEntryId(input.command),
    recordUserMessage: input.command.recordUserMessage ?? null,
    parentUserEntryId: input.parentUserEntryId ?? null,
    runStatus: input.runStatus,
    thinking: input.thinking,
    ...runtimeRef,
  });
};

export const runtimeEntryMetadata = (input: {
  command: RuntimeCommand;
  entryType: "request_context" | "runtime_instruction";
  baseLeafId: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
}) => {
  const runtimeRef = runtimeCommandRef(input.command);
  return standardizeRuntimeMessageMetadata({
    role: "user",
    source: "runtime",
    actorType: "runtime",
    baseLeafId: input.baseLeafId,
    metadata: {
      runtime: "runtimeMode" in input.command ? "agent" : "chat",
      runtimeEntryType: input.entryType,
    },
    turnId: commandTurnId(input.command),
    parentEntryId: input.parentEntryId ?? commandParentEntryId(input.command),
    rootUserEntryId: input.rootUserEntryId ?? commandRootUserEntryId(input.command),
    recordUserMessage: input.command.recordUserMessage ?? null,
    ...runtimeRef,
  });
};
