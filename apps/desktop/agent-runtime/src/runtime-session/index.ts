export type {
  BridgeDisplaySummary,
  BridgeRuntimeLink,
  BridgeSessionResultAuxiliaryEntry,
  BridgeSessionResultMessage,
  SessionMutationResult,
  SessionResult,
} from "./contracts/results.js";

export type {
  BridgeBranchSummaryEntry,
  BridgeCustomEntry,
  BridgeLedgerEntry,
  BridgeLedgerEntryBase,
  BridgeLedgerHeader,
  BridgeLeafEntry,
  BridgeMessage,
  BridgeMessageActorType,
  BridgeMessageEntry,
  BridgeMessageMetadata,
  BridgeMessageRole,
  BridgeMessageScope,
  BridgeMessageSource,
  BridgeRequestContextEntry,
  BridgeRuntimeInstructionEntry,
  BridgeSessionContext,
  BridgeSessionRecordRef,
} from "./core/types.js";

export {
  buildBridgeSessionContext,
} from "./core/projection.js";

export {
  standardizeBridgeMessageMetadata,
} from "./metadata/standard.js";

export {
  BridgeLedgerStorage,
} from "./storage/jsonl-store.js";

export {
  resolveBridgeSessionPaths,
} from "./storage/paths.js";

export type {
  RuntimeSessionTraceRecord,
} from "./trace/jsonl-trace.js";

export {
  appendRuntimeSessionTraceRecord,
  readRuntimeSessionTraceRecords,
} from "./trace/jsonl-trace.js";

export type {
  RuntimeSessionListOptions,
  RuntimeSessionQueryTarget,
  RuntimeSessionSnapshot,
  RuntimeSessionSummary,
  RuntimeSessionTimelineItem,
} from "./query/session-query.js";

export {
  buildRuntimeSessionTimeline,
  getCollaborationTimeline,
  getRuntimeSessionSnapshot,
  listRuntimeSessions,
} from "./query/session-query.js";
