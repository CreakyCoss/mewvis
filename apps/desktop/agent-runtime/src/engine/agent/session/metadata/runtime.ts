import type { AgentRunCommand, RuntimeChatCommand } from "../../runtimes/types.js";
import {
  commandParentEntryId,
  commandRootUserEntryId,
  commandTurnId,
} from "../runtime/session-link.js";
import type { RuntimeMessageRole } from "../../../../session/core/types.js";
import { standardizeRuntimeMessageMetadata } from "../../../../session/metadata/standard.js";

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
