import type { BridgeLedgerEntry, BridgeMessage } from "./types.js";
import type { BridgeLedgerStorage } from "../storage/jsonl-store.js";
import { buildBridgeSessionContext } from "./projection.js";
import { writeBridgeContextCache } from "../storage/context-cache.js";

const DEFAULT_KEEP_RECENT_MESSAGES = 8;
const MAX_SUMMARY_MESSAGE_CHARS = 900;

const roleLabel = (role: BridgeMessage["role"]) =>
  role === "assistant" ? "助手" : role === "system" ? "系统" : "用户";

const textPreview = (text: string) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_SUMMARY_MESSAGE_CHARS
    ? `${normalized.slice(0, MAX_SUMMARY_MESSAGE_CHARS)}...`
    : normalized;
};

const estimateTokens = (message: BridgeMessage) =>
  Math.max(1, Math.ceil(message.content.length / 4));

const summarizeMessages = (messages: BridgeMessage[]) =>
  messages
    .map((message) => `- ${roleLabel(message.role)}：${textPreview(message.content)}`)
    .join("\n");

const messageEntriesIn = (entries: BridgeLedgerEntry[]) =>
  entries.filter((entry): entry is Extract<BridgeLedgerEntry, { type: "message" }> =>
    entry.type === "message"
  );

export const compactBridgeLedger = async (
  storage: BridgeLedgerStorage,
  input: {
    contextPath: string;
    keepRecentMessages?: number;
    metadata?: Record<string, unknown>;
  },
) => {
  const branch = storage.getPathToRoot();
  const messageEntries = messageEntriesIn(branch);
  const keepRecentMessages = Math.max(
    1,
    input.keepRecentMessages ?? DEFAULT_KEEP_RECENT_MESSAGES,
  );

  if (messageEntries.length <= keepRecentMessages) {
    const context = buildBridgeSessionContext(storage);
    await writeBridgeContextCache(input.contextPath, context);
    return {
      compacted: false,
      context,
    };
  }

  const firstKeptMessage = messageEntries[messageEntries.length - keepRecentMessages];
  const compactedMessages = messageEntries
    .slice(0, Math.max(0, messageEntries.length - keepRecentMessages))
    .map((entry) => entry.message);
  const summary = summarizeMessages(compactedMessages);
  const tokensBefore = messageEntries
    .map((entry) => estimateTokens(entry.message))
    .reduce((total, value) => total + value, 0);

  await storage.appendEntry({
    type: "compaction",
    id: storage.createEntryId(),
    parentId: storage.getLeafId(),
    timestamp: new Date().toISOString(),
    summary,
    firstKeptEntryId: firstKeptMessage?.id ?? messageEntries[0]?.id ?? "",
    tokensBefore,
    details: input.metadata ?? null,
  });

  const context = buildBridgeSessionContext(storage);
  await writeBridgeContextCache(input.contextPath, context);
  return {
    compacted: true,
    context,
  };
};
