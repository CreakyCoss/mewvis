import type { AgentRunCommand, RuntimeChatCommand } from "../../runtimes/types.js";
import {
  commandParentEntryId,
  commandRootUserEntryId,
  commandTurnId,
} from "../runtime/session-link.js";
import type { BridgeMessageRole } from "../../../runtime-session/core/types.js";
import { standardizeBridgeMessageMetadata } from "../../../runtime-session/metadata/standard.js";

type RuntimeCommand = AgentRunCommand | RuntimeChatCommand;

const isAgentRunCommand = (command: RuntimeCommand): command is AgentRunCommand =>
  "runtimeMode" in command && command.runtimeMode === "agent";

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

export const runtimeBridgeMessageMetadata = (input: {
  command: RuntimeCommand;
  role: BridgeMessageRole;
  baseLeafId: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  parentUserEntryId?: string | null;
  runStatus?: "done" | "error";
  thinking?: string | null;
}) => {
  const runtimeRef = runtimeCommandRef(input.command);
  return standardizeBridgeMessageMetadata({
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

export const runtimeBridgeEntryMetadata = (input: {
  command: RuntimeCommand;
  entryType: "request_context" | "runtime_instruction";
  baseLeafId: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
}) => {
  const runtimeRef = runtimeCommandRef(input.command);
  return standardizeBridgeMessageMetadata({
    role: "user",
    source: "runtime",
    actorType: "bridge",
    baseLeafId: input.baseLeafId,
    metadata: {
      runtime: "runtimeMode" in input.command ? "agent" : "chat",
      bridgeEntryType: input.entryType,
    },
    turnId: commandTurnId(input.command),
    parentEntryId: input.parentEntryId ?? commandParentEntryId(input.command),
    rootUserEntryId: input.rootUserEntryId ?? commandRootUserEntryId(input.command),
    recordUserMessage: input.command.recordUserMessage ?? null,
    ...runtimeRef,
  });
};
