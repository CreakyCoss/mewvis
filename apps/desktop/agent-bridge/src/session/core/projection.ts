import type {
  BridgeLedgerEntry,
  BridgeMessage,
  BridgeMessageMetadata,
  BridgeSessionContext,
} from "./types.js";
import type {
  BridgeDisplaySummary,
  BridgeRuntimeLink,
} from "../contracts/results.js";
import type { BridgeLedgerStorage } from "../storage/jsonl-store.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const timestampMs = (entry: BridgeLedgerEntry) =>
  new Date(entry.timestamp).getTime();

const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const branchSummaryToMessage = (entry: Extract<BridgeLedgerEntry, { type: "branch_summary" }>): BridgeMessage => ({
  messageRecordId: entry.id,
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
    return {
      ...entry.message,
      messageRecordId: entry.id,
    };
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
    timestamp: timestampMs(entry),
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
    timestamp: timestampMs(entry),
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

const displaySummaryFromEntry = (
  entry: BridgeLedgerEntry,
): BridgeDisplaySummary | null => {
  if (entry.type !== "custom" || entry.customType !== "display_summary" || !isRecord(entry.data)) {
    return null;
  }

  const targetLeafId = stringValue(entry.data.targetLeafId);
  const summary = stringValue(entry.data.summary);
  if (!targetLeafId || !summary) {
    return null;
  }

  return {
    recordId: entry.id,
    targetLeafId,
    summary,
    timestamp: timestampMs(entry),
    generatedAt: numberValue(entry.data.generatedAt) ?? timestampMs(entry),
    summaryInstruction: stringValue(entry.data.summaryInstruction),
    runtimeId: stringValue(entry.data.runtimeId),
    modelId: stringValue(entry.data.modelId),
    sourceCharCount: numberValue(entry.data.sourceCharCount),
    chunkCount: numberValue(entry.data.chunkCount),
    llmCallCount: numberValue(entry.data.llmCallCount),
    messageCount: numberValue(entry.data.messageCount),
    entryCount: numberValue(entry.data.entryCount),
  };
};

const buildDisplaySummaries = (
  allEntries: BridgeLedgerEntry[],
  activeEntryIds: Set<string>,
  leafId: string | null,
) => {
  const displaySummaries = allEntries
    .map(displaySummaryFromEntry)
    .filter((summary): summary is BridgeDisplaySummary =>
      Boolean(summary && activeEntryIds.has(summary.targetLeafId))
    )
    .sort((left, right) =>
      left.generatedAt - right.generatedAt || left.timestamp - right.timestamp
    );
  const displaySummary = leafId
    ? displaySummaries.filter((summary) => summary.targetLeafId === leafId).at(-1) ?? null
    : null;

  return { displaySummary, displaySummaries };
};

const metadataFromEntry = (
  entry: BridgeLedgerEntry,
): BridgeMessageMetadata | null => {
  if (entry.type === "message") {
    return entry.message.metadata ?? null;
  }
  if (entry.type === "request_context" || entry.type === "runtime_instruction") {
    return entry.metadata ?? null;
  }
  return null;
};

const isRuntimeMetadata = (metadata: BridgeMessageMetadata | null): metadata is BridgeMessageMetadata =>
  metadata?.source === "runtime" || typeof metadata?.runtime === "string";

const runtimeLinkId = (metadata: BridgeMessageMetadata, entry: BridgeLedgerEntry) =>
  metadata.runId?.trim() ||
  metadata.taskId?.trim() ||
  metadata.streamId?.trim() ||
  metadata.turnId?.trim() ||
  entry.id;

const ensureRuntimeLink = (
  links: Map<string, BridgeRuntimeLink>,
  linkId: string,
) => {
  let link = links.get(linkId);
  if (!link) {
    link = {
      linkId,
      runtime: null,
      runtimeId: null,
      agentRoleId: null,
      agentSessionId: null,
      runId: null,
      taskId: null,
      streamId: null,
      turnId: null,
      parentEntryId: null,
      rootUserEntryId: null,
      systemMessageRecordId: null,
      userMessageRecordId: null,
      assistantMessageRecordIds: [],
      requestContextRecordIds: [],
      runtimeInstructionRecordIds: [],
      messageRecordIds: [],
      status: "running",
      startedAt: null,
      endedAt: null,
    };
    links.set(linkId, link);
  }
  return link;
};

const pushUnique = (items: string[], value: string) => {
  if (!items.includes(value)) {
    items.push(value);
  }
};

const applyMetadataToRuntimeLink = (
  link: BridgeRuntimeLink,
  metadata: BridgeMessageMetadata,
) => {
  link.runtime ??= stringValue(metadata.runtime);
  link.runtimeId ??= stringValue(metadata.runtimeId);
  link.agentRoleId ??= stringValue(metadata.agentRoleId);
  link.agentSessionId ??= stringValue(metadata.agentSessionId);
  link.runId ??= stringValue(metadata.runId);
  link.taskId ??= stringValue(metadata.taskId);
  link.streamId ??= stringValue(metadata.streamId);
  link.turnId ??= stringValue(metadata.turnId);
  link.parentEntryId ??= stringValue(metadata.parentEntryId);
  link.rootUserEntryId ??= stringValue(metadata.rootUserEntryId);
  if (metadata.runStatus === "done" || metadata.runStatus === "error") {
    link.status = metadata.runStatus;
  }
};

const appendRuntimeLinkEntry = (
  link: BridgeRuntimeLink,
  entry: BridgeLedgerEntry,
) => {
  const entryTimestamp = timestampMs(entry);
  link.startedAt = link.startedAt == null
    ? entryTimestamp
    : Math.min(link.startedAt, entryTimestamp);

  if (entry.type === "message") {
    pushUnique(link.messageRecordIds, entry.id);
    if (entry.message.role === "system") {
      link.systemMessageRecordId ??= entry.id;
    }
    if (entry.message.role === "user") {
      link.userMessageRecordId ??= entry.id;
    }
    if (entry.message.role === "assistant") {
      pushUnique(link.assistantMessageRecordIds, entry.id);
      link.endedAt = link.endedAt == null
        ? entryTimestamp
        : Math.max(link.endedAt, entryTimestamp);
    }
    return;
  }

  if (entry.type === "request_context") {
    pushUnique(link.requestContextRecordIds, entry.id);
    return;
  }

  if (entry.type === "runtime_instruction") {
    pushUnique(link.runtimeInstructionRecordIds, entry.id);
  }
};

const buildRuntimeLinks = (entries: BridgeLedgerEntry[]) => {
  const links = new Map<string, BridgeRuntimeLink>();

  for (const entry of entries) {
    const metadata = metadataFromEntry(entry);
    if (!isRuntimeMetadata(metadata)) {
      continue;
    }
    const link = ensureRuntimeLink(links, runtimeLinkId(metadata, entry));
    applyMetadataToRuntimeLink(link, metadata);
    appendRuntimeLinkEntry(link, entry);
  }

  return [...links.values()]
    .map((link) => ({
      ...link,
      status: link.status === "running" && link.assistantMessageRecordIds.length > 0
        ? "done"
        : link.status,
    }))
    .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0));
};

export const buildBridgeSessionContext = (
  storage: BridgeLedgerStorage,
  leafId: string | null = storage.getLeafId(),
): BridgeSessionContext => {
  const entries = storage.getPathToRoot(leafId);
  const activeEntryIds = new Set(entries.map((entry) => entry.id));
  const { displaySummary, displaySummaries } = buildDisplaySummaries(
    storage.getEntries(),
    activeEntryIds,
    leafId,
  );
  const messages: BridgeMessage[] = [];
  const requestContexts: BridgeSessionContext["requestContexts"] = [];
  const runtimeInstructions: BridgeSessionContext["runtimeInstructions"] = [];
  const visible = { messages, requestContexts, runtimeInstructions };

  for (const entry of entries) {
    appendVisibleEntry(entry, visible);
  }

  return {
    summary: "",
    messages,
    requestContexts,
    runtimeInstructions,
    displaySummary,
    displaySummaries,
    runtimeLinks: buildRuntimeLinks(entries),
    leafId,
    entries,
  };
};
