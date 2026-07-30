import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RuntimeModelInput } from "@/agent-client/types";

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

export async function readLedger(input: { workspacePath: string; sessionRootDir: string }) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("read_agent_runtime_session", { input });
}

export async function deleteLedger(input: { workspacePath: string; sessionRootDir: string }) {
  if (!isTauri()) {
    return null;
  }

  return invoke<void>("delete_agent_runtime_session", { input });
}

export async function summarizeLedger(input: {
  workspacePath: string;
  sessionRootDir: string;
  agentRoleId?: string | null;
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
  runtimeModel?: RuntimeModelInput | null;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("summarize_agent_runtime_session", { input });
}
