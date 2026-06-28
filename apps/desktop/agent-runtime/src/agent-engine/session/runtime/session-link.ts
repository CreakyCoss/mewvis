import { randomUUID } from "node:crypto";
import type {
  AgentRunCommand,
  RuntimeChatCommand,
  RuntimeSessionLink,
} from "../../runtimes/types.js";
import type { BridgeLedgerEntry } from "../core/types.js";

type RuntimeSessionLinkCommand = (RuntimeChatCommand | AgentRunCommand) & {
  sessionLink?: RuntimeSessionLink | null;
  recordUserMessage?: boolean | null;
};

const isAgentRunCommand = (
  command: RuntimeSessionLinkCommand,
): command is AgentRunCommand & { sessionLink?: RuntimeSessionLink | null } =>
  "runtimeMode" in command && command.runtimeMode === "agent";

export const sessionLinkFor = (
  command: RuntimeSessionLinkCommand,
): RuntimeSessionLink => command.sessionLink ?? {};

export const commandTurnId = (command: RuntimeSessionLinkCommand) =>
  sessionLinkFor(command).turnId ?? null;

export const commandParentEntryId = (command: RuntimeSessionLinkCommand) =>
  sessionLinkFor(command).parentEntryId ?? null;

export const commandRootUserEntryId = (command: RuntimeSessionLinkCommand) =>
  sessionLinkFor(command).rootUserEntryId ?? null;

const commandIdTurnId = (command: RuntimeSessionLinkCommand) => {
  if (isAgentRunCommand(command)) {
    return command.taskId;
  }
  return command.streamId ?? command.requestId ?? null;
};

export const latestTurnIdInEntries = (entries: BridgeLedgerEntry[]) => {
  for (const entry of entries.slice().reverse()) {
    if (entry.type !== "message") {
      continue;
    }
    const turnId = entry.message.metadata?.turnId;
    if (typeof turnId === "string" && turnId.trim()) {
      return turnId.trim();
    }
  }
  return null;
};

export const inferCommandTurnId = (
  command: RuntimeSessionLinkCommand,
  entries?: BridgeLedgerEntry[],
) => {
  const explicit = commandTurnId(command);
  if (explicit) {
    return explicit;
  }

  if (command.recordUserMessage === false && entries?.length) {
    const inherited = latestTurnIdInEntries(entries);
    if (inherited) {
      return inherited;
    }
  }

  return commandIdTurnId(command) ?? `bridge-turn-${randomUUID()}`;
};

export const shouldRecordRuntimeUserMessage = (
  entries: BridgeLedgerEntry[],
  parentEntryId: string | null | undefined,
) => {
  const parentId = parentEntryId?.trim() || null;
  if (!parentId) {
    return true;
  }

  const parent = entries.find((entry) => entry.id === parentId);
  if (parent?.type !== "message") {
    return true;
  }

  if (parent.message.role === "user") {
    return false;
  }

  if (
    parent.message.role === "assistant" &&
    parent.message.metadata?.recordUserMessage === false
  ) {
    return false;
  }

  return true;
};

export const withSessionLink = <TCommand extends RuntimeSessionLinkCommand>(
  command: TCommand,
  patch: RuntimeSessionLink,
): TCommand => ({
  ...command,
  sessionLink: {
    ...command.sessionLink,
    ...patch,
  },
});
