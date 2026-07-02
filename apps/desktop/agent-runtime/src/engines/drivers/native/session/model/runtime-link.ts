import { randomUUID } from "node:crypto";
import type {
  RuntimeSessionCommand,
  RuntimeSessionLink,
} from "./runtime-command.js";
import type { RuntimeLedgerEntry } from "./ledger.js";

type RuntimeSessionLinkCommand = RuntimeSessionCommand & {
  sessionLink?: RuntimeSessionLink | null;
  recordUserMessage?: boolean | null;
};

export const sessionLinkFor = (
  command: RuntimeSessionLinkCommand,
): RuntimeSessionLink => command.sessionLink ?? {};

export const commandTurnId = (command: RuntimeSessionLinkCommand) =>
  sessionLinkFor(command).turnId ?? null;

export const commandParentEntryId = (command: RuntimeSessionLinkCommand) =>
  sessionLinkFor(command).parentEntryId ?? null;

export const commandRootUserEntryId = (command: RuntimeSessionLinkCommand) =>
  sessionLinkFor(command).rootUserEntryId ?? null;

const commandIdTurnId = (command: RuntimeSessionLinkCommand) =>
  command.taskId ?? command.requestId ?? null;

export const latestTurnIdInEntries = (entries: RuntimeLedgerEntry[]) => {
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
  entries?: RuntimeLedgerEntry[],
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

  return commandIdTurnId(command) ?? `runtime-turn-${randomUUID()}`;
};

export const shouldRecordRuntimeUserMessage = (
  entries: RuntimeLedgerEntry[],
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
