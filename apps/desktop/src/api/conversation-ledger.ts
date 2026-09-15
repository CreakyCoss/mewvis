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
  return readAgentRuntimeSession(input);
}

export async function deleteLedger(input: SessionTargetParams) {
  return deleteAgentRuntimeSession(input);
}

export async function summarizeLedger(input: AgentClientLedgerSummaryInput) {
  return summarizeAgentRuntimeSession(input);
}
