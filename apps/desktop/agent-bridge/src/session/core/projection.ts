import type {
  BridgeCompactionEntry,
  BridgeLedgerEntry,
  BridgeMessage,
  BridgeSessionContext,
} from "./types.js";
import type { BridgeLedgerStorage } from "../storage/jsonl-store.js";

const branchSummaryToMessage = (entry: Extract<BridgeLedgerEntry, { type: "branch_summary" }>): BridgeMessage => ({
  role: "user",
  content: [
    "The following is a summary of a branch that this conversation came back from:",
    "",
    "<summary>",
    entry.summary,
    "</summary>",
  ].join("\n"),
  timestamp: new Date(entry.timestamp).getTime(),
  metadata: {
    bridgeEntryType: "branch_summary",
    fromId: entry.fromId,
  },
});

const messageFromEntry = (entry: BridgeLedgerEntry): BridgeMessage | null => {
  if (entry.type === "message") {
    return entry.message;
  }
  if (entry.type === "branch_summary" && entry.summary.trim()) {
    return branchSummaryToMessage(entry);
  }
  return null;
};

const requestContextFromEntry = (
  entry: BridgeLedgerEntry,
): BridgeSessionContext["requestContexts"][number] | null => {
  if (entry.type !== "request_context") {
    return null;
  }
  return {
    recordId: entry.id,
    content: entry.content,
    timestamp: new Date(entry.timestamp).getTime(),
    metadata: entry.metadata ?? null,
  };
};

const runtimeInstructionFromEntry = (
  entry: BridgeLedgerEntry,
): BridgeSessionContext["runtimeInstructions"][number] | null => {
  if (entry.type !== "runtime_instruction") {
    return null;
  }
  return {
    recordId: entry.id,
    content: entry.content,
    timestamp: new Date(entry.timestamp).getTime(),
    metadata: entry.metadata ?? null,
  };
};

const appendVisibleEntry = (
  entry: BridgeLedgerEntry,
  context: Pick<BridgeSessionContext, "messages" | "requestContexts" | "runtimeInstructions">,
) => {
  const message = messageFromEntry(entry);
  if (message) {
    context.messages.push(message);
  }
  const requestContext = requestContextFromEntry(entry);
  if (requestContext) {
    context.requestContexts.push(requestContext);
  }
  const runtimeInstruction = runtimeInstructionFromEntry(entry);
  if (runtimeInstruction) {
    context.runtimeInstructions.push(runtimeInstruction);
  }
};

const latestCompactionIn = (entries: BridgeLedgerEntry[]): BridgeCompactionEntry | null => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "compaction") {
      return entry;
    }
  }

  return null;
};

export const buildBridgeSessionContext = (
  storage: BridgeLedgerStorage,
  leafId: string | null = storage.getLeafId(),
): BridgeSessionContext => {
  const entries = storage.getPathToRoot(leafId);
  const compaction = latestCompactionIn(entries);
  const messages: BridgeMessage[] = [];
  const requestContexts: BridgeSessionContext["requestContexts"] = [];
  const runtimeInstructions: BridgeSessionContext["runtimeInstructions"] = [];
  const visible = { messages, requestContexts, runtimeInstructions };

  if (!compaction) {
    for (const entry of entries) {
      appendVisibleEntry(entry, visible);
    }

    return {
      summary: "",
      messages,
      requestContexts,
      runtimeInstructions,
      leafId,
      entries,
      compaction: null,
    };
  }

  const compactionIndex = entries.findIndex((entry) => entry.id === compaction.id);
  let foundFirstKept = false;

  for (let index = 0; index < compactionIndex; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    if (entry.id === compaction.firstKeptEntryId) {
      foundFirstKept = true;
    }
    if (foundFirstKept) {
      appendVisibleEntry(entry, visible);
    }
  }

  for (let index = compactionIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    appendVisibleEntry(entry, visible);
  }

  return {
    summary: compaction.summary,
    messages,
    requestContexts,
    runtimeInstructions,
    leafId,
    entries,
    compaction,
  };
};
