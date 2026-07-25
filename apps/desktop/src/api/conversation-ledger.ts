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

export async function createLedger(input: CreateLedgerInput) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("create_agent_runtime_session", { input });
}

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

export async function disposeLedgerWorkers(input: { workspacePath: string; sessionRootDir: string }) {
  if (!isTauri()) {
    return null;
  }

  return invoke<void>("dispose_agent_runtime_session_workers", { input });
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

export async function compactLedger(input: {
  workspacePath: string;
  sessionRootDir: string;
  agentRoleId: string;
  compactInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("compact_agent_runtime_session", { input });
}

export async function rebuildAgentLedgerSession(input: {
  workspacePath: string;
  sessionRootDir: string;
  agentRoleId: string;
  rebuildInstruction?: string | null;
  userMessage?: string | null;
  runtimeModel?: RuntimeModelInput | null;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("rebuild_agent_runtime_agent_session", { input });
}

export async function editLedgerMessage(input: {
  workspacePath: string;
  sessionRootDir: string;
  messageRecordId: string;
  content: string;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("edit_agent_runtime_session_message", { input });
}

export async function deleteLedgerMessage(input: {
  workspacePath: string;
  sessionRootDir: string;
  messageRecordId: string;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("delete_agent_runtime_session_message", { input });
}

export async function appendLedgerMessages(input: {
  workspacePath: string;
  sessionRootDir: string;
  messages: LedgerMessageInput[];
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("append_agent_runtime_session_messages", { input });
}

export async function rebuildLedger(input: {
  workspacePath: string;
  sessionRootDir: string;
  messages: LedgerMessageInput[];
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("rebuild_agent_runtime_session", { input });
}
