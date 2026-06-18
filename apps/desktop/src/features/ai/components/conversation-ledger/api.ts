import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import type {
  CreateLedgerInput,
  LedgerMessageInput,
  LedgerResult,
} from "./types";

export async function createLedger(input: CreateLedgerInput) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("create_agent_runtime_session", { input });
}

export async function readLedger(input: {
  workspacePath: string;
  sessionRootDir: string;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("read_agent_runtime_session", { input });
}

export async function compactLedger(input: {
  workspacePath: string;
  sessionRootDir: string;
  agentId?: string | null;
  agentRoleId: string;
  compactInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("compact_agent_runtime_session", { input });
}

export async function summarizeLedger(input: {
  workspacePath: string;
  sessionRootDir: string;
  agentId?: string | null;
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
  runtimeModel?: RuntimeModelInput | null;
}) {
  if (!isTauri()) {
    return null;
  }

  return invoke<LedgerResult>("summarize_agent_runtime_session", { input });
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

export {
  appendLedgerMessages as appendAgentRuntimeSessionMessages,
  compactLedger as compactAgentRuntimeSession,
  createLedger as createAgentRuntimeSession,
  deleteLedgerMessage as deleteAgentRuntimeSessionMessage,
  editLedgerMessage as editAgentRuntimeSessionMessage,
  readLedger as readAgentRuntimeSession,
  rebuildLedger as rebuildAgentRuntimeSession,
  summarizeLedger as summarizeAgentRuntimeSession,
};
