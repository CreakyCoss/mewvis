export type {
  BridgeDisplaySummary,
  BridgeRuntimeLink,
  BridgeSessionResultAuxiliaryEntry,
  BridgeSessionResultMessage,
  SessionMutationResult,
  SessionResult,
} from "./contracts/results.js";

export {
  appendBridgeSessionMessages,
  compactBridgeSession,
  createBridgeSession,
  deleteBridgeSessionMessage,
  editBridgeSessionMessage,
  readBridgeSession,
  rebuildBridgeAgentSession,
  rebuildBridgeSession,
  summarizeBridgeSession,
} from "./operations/session-service.js";
