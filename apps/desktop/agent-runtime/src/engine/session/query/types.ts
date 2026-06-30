import type {
  RuntimeLedgerEntry,
  RuntimeLedgerHeader,
} from "../core/types.js";
import type {
  RuntimeSessionSummary,
  RuntimeSessionTimelineItem,
} from "../../../protocol/session.js";
import type { RuntimeSessionTraceRecord } from "../trace/types.js";

export type RuntimeSessionQueryTarget = {
  workspacePath: string;
  sessionRootDir: string;
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
