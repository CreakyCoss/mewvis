import type {
  RuntimeLedgerEntry,
  RuntimeLedgerHeader,
} from "../core/types.js";
import type {
  RuntimeSessionTraceRecord,
} from "./trace.js";

export type RuntimeSessionQueryTarget = {
  workspacePath: string;
  sessionRootDir: string;
};

export type RuntimeSessionSummary = {
  workspacePath: string;
  sessionRootDir: string;
  ledgerPath: string;
  tracePath: string;
  sessionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  leafId?: string | null;
  entryCount: number;
  traceCount: number;
  workflowRunIds: string[];
  workflowIds: string[];
  modeIds: string[];
  latestWorkflowRunId?: string | null;
};

export type RuntimeSessionTimelineItem = {
  id: string;
  index: number;
  source: "agent" | "collaboration" | "runtime";
  type: string;
  timestamp?: string | null;
  taskId?: string | null;
  workflowRunId?: string | null;
  workflowId?: string | null;
  modeId?: string | null;
  stepId?: string | null;
  stepType?: string | null;
  agentRoleId?: string | null;
  agentTaskId?: string | null;
  status?: "started" | "done" | "skipped" | "error" | null;
  detail?: string | null;
  payload?: unknown;
};

export type RuntimeSessionSnapshot = {
  session: RuntimeSessionSummary;
  ledger?: {
    header: RuntimeLedgerHeader;
    entries: RuntimeLedgerEntry[];
  } | null;
  trace?: RuntimeSessionTraceRecord[];
  timeline?: RuntimeSessionTimelineItem[];
};

export type RuntimeSessionListOptions = {
  workspacePath: string;
  rootDir: string;
  limit?: number | null;
  maxDepth?: number | null;
};
