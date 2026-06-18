import type {
  BridgeDisplaySummary,
  BridgeRuntimeLink,
} from "../contracts/results.js";

export type BridgeMessageRole = "user" | "assistant" | "system";

export type BridgeMessageActorType =
  | "user"
  | "agent"
  | "system"
  | "app"
  | "bridge";

export type BridgeMessageScope = "shared" | "agent_private";

export type BridgeMessageSource =
  | "runtime"
  | "app_create_session"
  | "app_append"
  | "app_rebuild"
  | "app_edit"
  | "app_delete"
  | "bridge_compact"
  | "bridge_display_summary"
  | "bridge_branch";

export type BridgeMessageMetadata = {
  bridgeMetadataVersion?: 1;
  actorType?: BridgeMessageActorType;
  source?: BridgeMessageSource;
  scope?: BridgeMessageScope;
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

export type BridgeMessage = {
  messageRecordId?: string;
  role: BridgeMessageRole;
  content: string;
  timestamp: number;
  metadata?: BridgeMessageMetadata | null;
};

export type BridgeLedgerHeader = {
  type: "bridge_session";
  version: 1;
  id: string;
  timestamp: string;
  workspacePath: string;
  sessionRootDir: string;
};

export type BridgeLedgerEntryBase = {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
};

export type BridgeMessageEntry = BridgeLedgerEntryBase & {
  type: "message";
  message: BridgeMessage;
};

export type BridgeRequestContextEntry = BridgeLedgerEntryBase & {
  type: "request_context";
  content: string;
  metadata?: BridgeMessageMetadata | null;
};

export type BridgeRuntimeInstructionEntry = BridgeLedgerEntryBase & {
  type: "runtime_instruction";
  content: string;
  metadata?: BridgeMessageMetadata | null;
};

export type BridgeBranchSummaryEntry = BridgeLedgerEntryBase & {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: unknown;
};

export type BridgeCustomEntry = BridgeLedgerEntryBase & {
  type: "custom";
  customType: string;
  data?: unknown;
};

export type BridgeLeafEntry = BridgeLedgerEntryBase & {
  type: "leaf";
  targetId: string | null;
};

export type BridgeLedgerEntry =
  | BridgeMessageEntry
  | BridgeRequestContextEntry
  | BridgeRuntimeInstructionEntry
  | BridgeBranchSummaryEntry
  | BridgeCustomEntry
  | BridgeLeafEntry;

export type BridgeSessionRecordRef = {
  sessionRootDir: string;
  userMessageRecordId?: string | null;
  requestContextRecordId?: string | null;
  runtimeInstructionRecordId?: string | null;
  assistantMessageRecordId?: string | null;
};

export type BridgeSessionContext = {
  summary: string;
  messages: BridgeMessage[];
  requestContexts: Array<{
    recordId: string;
    content: string;
    timestamp: number;
    metadata?: BridgeMessageMetadata | null;
  }>;
  runtimeInstructions: Array<{
    recordId: string;
    content: string;
    timestamp: number;
    metadata?: BridgeMessageMetadata | null;
  }>;
  displaySummary: BridgeDisplaySummary | null;
  displaySummaries: BridgeDisplaySummary[];
  runtimeLinks: BridgeRuntimeLink[];
  leafId: string | null;
  entries: BridgeLedgerEntry[];
};
