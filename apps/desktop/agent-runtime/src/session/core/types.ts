import type {
  RuntimeDisplaySummary,
  RuntimeLink,
} from "../contracts/results.js";

export type RuntimeMessageRole = "user" | "assistant" | "system";

export type RuntimeMessageActorType =
  | "user"
  | "agent"
  | "system"
  | "app"
  | "runtime";

export type RuntimeMessageScope = "shared" | "agent_private";

export type RuntimeMessageSource =
  | "runtime"
  | "app_create_session"
  | "app_append"
  | "app_rebuild"
  | "app_edit"
  | "app_delete"
  | "runtime_compact"
  | "runtime_rebuild_agent_session"
  | "runtime_display_summary"
  | "runtime_branch";

export type RuntimeMessageMetadata = {
  runtimeMetadataVersion?: 1;
  actorType?: RuntimeMessageActorType;
  source?: RuntimeMessageSource;
  scope?: RuntimeMessageScope;
  runtimeId?: string | null;
  runtimeAgentId?: string | null;
  agentRoleId?: string | null;
  agentKey?: string | null;
  agentSessionId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  streamId?: string | null;
  turnId?: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  recordUserMessage?: boolean | null;
  baseLeafId?: string | null;
  parentUserEntryId?: string | null;
  uiMessageId?: string | null;
  runtime?: string | null;
  runStatus?: "done" | "error";
  thinking?: string | null;
  [key: string]: unknown;
};

export type RuntimeMessage = {
  messageRecordId?: string;
  role: RuntimeMessageRole;
  content: string;
  timestamp: number;
  metadata?: RuntimeMessageMetadata | null;
};

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

export type RuntimeSessionRecordRef = {
  sessionRootDir: string;
  userMessageRecordId?: string | null;
  requestContextRecordId?: string | null;
  runtimeInstructionRecordId?: string | null;
  assistantMessageRecordId?: string | null;
};

export type RuntimeSessionContext = {
  summary: string;
  messages: RuntimeMessage[];
  requestContexts: Array<{
    recordId: string;
    content: string;
    timestamp: number;
    metadata?: RuntimeMessageMetadata | null;
  }>;
  runtimeInstructions: Array<{
    recordId: string;
    content: string;
    timestamp: number;
    metadata?: RuntimeMessageMetadata | null;
  }>;
  displaySummary: RuntimeDisplaySummary | null;
  displaySummaries: RuntimeDisplaySummary[];
  runtimeLinks: RuntimeLink[];
  leafId: string | null;
  entries: RuntimeLedgerEntry[];
};
