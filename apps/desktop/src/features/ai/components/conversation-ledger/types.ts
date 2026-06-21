import type { Ref } from "react";
import type { RuntimeModelInput } from "@/agent-client/protocol";

export type LedgerMessage = {
  messageRecordId: string;
  role: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown> | null;
};

export type LedgerAuxiliaryEntry = {
  recordId: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown> | null;
};

export type LedgerMessageInput = {
  role: string;
  content: string;
  timestamp?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type CreateLedgerInput = {
  workspacePath: string;
  sessionRootDir: string;
  systemPrompt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type LedgerDisplaySummary = {
  recordId: string;
  targetLeafId: string;
  summary: string;
  timestamp: number;
  generatedAt: number;
  summaryInstruction?: string | null;
  runtimeId?: string | null;
  modelId?: string | null;
  sourceCharCount?: number | null;
  chunkCount?: number | null;
  llmCallCount?: number | null;
  messageCount?: number | null;
  entryCount?: number | null;
};

export type LedgerRuntimeLink = {
  linkId: string;
  runtime?: string | null;
  runtimeId?: string | null;
  agentRoleId?: string | null;
  agentSessionId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  streamId?: string | null;
  turnId?: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  systemMessageRecordId?: string | null;
  userMessageRecordId?: string | null;
  assistantMessageRecordIds: string[];
  requestContextRecordIds: string[];
  runtimeInstructionRecordIds: string[];
  messageRecordIds: string[];
  status?: "running" | "done" | "error" | null;
  startedAt?: number | null;
  endedAt?: number | null;
};

export type LedgerResult = {
  type: "session_result" | "session_mutation_result";
  requestId?: string | null;
  sessionRootDir: string;
  summary: string;
  messages: LedgerMessage[];
  requestContexts?: LedgerAuxiliaryEntry[];
  runtimeInstructions?: LedgerAuxiliaryEntry[];
  displaySummary?: LedgerDisplaySummary | null;
  displaySummaries?: LedgerDisplaySummary[];
  runtimeLinks?: LedgerRuntimeLink[];
  messageRecordId?: string | null;
  messageRecordIds?: string[];
  compacted?: boolean;
  rebuilt?: boolean;
};

export type ConversationLedgerHandle = {
  refresh: () => Promise<void>;
  refreshSummary: () => Promise<void>;
};

export type ConversationLedgerProps = {
  bind?: Ref<ConversationLedgerHandle>;
  workspacePath: string;
  chatId: string | null;
  runtimeModel?: RuntimeModelInput | null;
  agentId?: string | null;
  summaryInstruction?: string | null;
};
