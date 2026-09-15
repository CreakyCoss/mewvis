export type {
  RuntimeMessage,
  RuntimeMessageActorType,
  RuntimeMessageMetadata,
  RuntimeMessageRole,
  RuntimeMessageScope,
  RuntimeMessageSource,
  RuntimeSessionContextView,
  RuntimeSessionRecordRef,
} from "./context.js";

import type { RuntimeMessage, RuntimeMessageMetadata, RuntimeSessionContextView } from "./context.js";

export type RuntimeLedgerHeader = {
  type: "runtime_session";
  version: 1;
  id: string;
  timestamp: string;
  workspacePath: string;
  sessionRootDir: string;
};

export type RuntimeLedgerEntryBase = {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
};

export type RuntimeMessageEntry = RuntimeLedgerEntryBase & {
  type: "message";
  message: RuntimeMessage;
};

export type RuntimeRequestContextEntry = RuntimeLedgerEntryBase & {
  type: "request_context";
  content: string;
  metadata?: RuntimeMessageMetadata | null;
};

export type RuntimeInstructionEntry = RuntimeLedgerEntryBase & {
  type: "runtime_instruction";
  content: string;
  metadata?: RuntimeMessageMetadata | null;
};

export type RuntimeBranchSummaryEntry = RuntimeLedgerEntryBase & {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: unknown;
};

export type RuntimeCustomEntry = RuntimeLedgerEntryBase & {
  type: "custom";
  customType: string;
  data?: unknown;
};

export type RuntimeLeafEntry = RuntimeLedgerEntryBase & {
  type: "leaf";
  targetId: string | null;
};

export type RuntimeLedgerEntry =
  | RuntimeMessageEntry
  | RuntimeRequestContextEntry
  | RuntimeInstructionEntry
  | RuntimeBranchSummaryEntry
  | RuntimeCustomEntry
  | RuntimeLeafEntry;

export type RuntimeSessionContext = RuntimeSessionContextView & {
  leafId: string | null;
  entries: RuntimeLedgerEntry[];
};
