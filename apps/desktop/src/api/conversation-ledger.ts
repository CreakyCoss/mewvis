import { isTauri } from "@tauri-apps/api/core";
import { deleteAgentRuntimeSession, readAgentRuntimeSession, summarizeAgentRuntimeSession } from "@/api/agent-runtime";
import type { AgentClientLedgerResult, AgentClientLedgerSummaryInput } from "@/agent-client/contracts";
import type {
  RuntimeDisplaySummary,
  RuntimeLink,
  RuntimeSessionAuxiliaryEntry,
  RuntimeSessionMessage,
  SessionTargetParams,
} from "@/agent-client/wire";

export type LedgerMessage = RuntimeSessionMessage;
export type LedgerAuxiliaryEntry = RuntimeSessionAuxiliaryEntry;
export type LedgerDisplaySummary = RuntimeDisplaySummary;
export type LedgerRuntimeLink = RuntimeLink;
export type LedgerResult = AgentClientLedgerResult;

export async function readLedger(input: SessionTargetParams) {
  if (!isTauri()) {
    return null;
  }

  return readAgentRuntimeSession(input);
}

export async function deleteLedger(input: SessionTargetParams) {
  if (!isTauri()) {
    return null;
  }

  return deleteAgentRuntimeSession(input);
}

export async function summarizeLedger(input: AgentClientLedgerSummaryInput) {
  if (!isTauri()) {
    return null;
  }

  return summarizeAgentRuntimeSession(input);
}
