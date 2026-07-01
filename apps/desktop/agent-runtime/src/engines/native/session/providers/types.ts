import type {
  RuntimeInstructionEntry,
  RuntimeLedgerEntry,
  RuntimeLedgerHeader,
  RuntimeMessage,
  RuntimeMessageEntry,
  RuntimeMessageMetadata,
  RuntimeRequestContextEntry,
  RuntimeCustomEntry,
  RuntimeLeafEntry,
} from "../model/ledger.js";
import type {
  RuntimeSessionSummary,
  RuntimeSessionTimelineItem,
} from "../../../protocol/session.js";

export type RuntimeSessionProviderId = "jsonl" | (string & {});

export type RuntimeSessionPathInput = {
  workspacePath: string;
  sessionRootDir: string;
};

export type RuntimeSessionPaths = {
  sessionDir: string;
  artifactsDir: string;
};

export type RuntimeSessionTraceRecord = {
  type: string;
  timestamp?: string;
  [key: string]: unknown;
};

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

export type RuntimeSessionStore = {
  readonly header: RuntimeLedgerHeader;
  getLeafId(): string | null;
  getEntries(): RuntimeLedgerEntry[];
  getEntry(id: string): RuntimeLedgerEntry | undefined;
  createEntryId(): string;
  appendMessage(
    message: RuntimeMessage,
    parentId?: string | null,
    id?: string,
  ): Promise<RuntimeMessageEntry>;
  appendRequestContext(
    content: string,
    metadata: RuntimeMessageMetadata | null,
    parentId?: string | null,
  ): Promise<RuntimeRequestContextEntry>;
  appendRuntimeInstruction(
    content: string,
    metadata: RuntimeMessageMetadata | null,
    parentId?: string | null,
  ): Promise<RuntimeInstructionEntry>;
  appendCustom(
    customType: string,
    data?: unknown,
    parentId?: string | null,
  ): Promise<RuntimeCustomEntry>;
  setLeafId(targetId: string | null): Promise<RuntimeLeafEntry>;
  getPathToRoot(leafId?: string | null): RuntimeLedgerEntry[];
};

export type RuntimeSessionHandle = {
  paths: RuntimeSessionPaths;
  storage: RuntimeSessionStore;
  appendTrace<TRecord extends RuntimeSessionTraceRecord>(record: TRecord): Promise<TRecord>;
  refreshManifest(): Promise<void>;
};

export type RuntimeSessionProvider = {
  readonly id: RuntimeSessionProviderId;
  resolvePaths(input: RuntimeSessionPathInput): Promise<RuntimeSessionPaths>;
  openOrCreate(input: RuntimeSessionPathInput): Promise<RuntimeSessionHandle>;
  listRuntimeSessions(input: RuntimeSessionListOptions): Promise<RuntimeSessionSummary[]>;
  getRuntimeSessionSnapshot(
    target: RuntimeSessionQueryTarget,
    options?: {
      includeLedger?: boolean | null;
      includeTrace?: boolean | null;
      includeTimeline?: boolean | null;
      timelineLimit?: number | null;
    },
  ): Promise<RuntimeSessionSnapshot>;
  getCollaborationTimeline(
    target: RuntimeSessionQueryTarget,
    options?: {
      workflowRunId?: string | null;
      limit?: number | null;
    },
  ): Promise<{
    session: RuntimeSessionSummary;
    workflowRunId?: string | null;
    events: RuntimeSessionTimelineItem[];
  }>;
};
