import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RuntimeModelInput } from "@/agent-client/types";
import type {
  CreateLedgerInput,
  LedgerMessageInput,
  LedgerResult,
} from "@/features/ai/components/conversation-ledger/types";

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
