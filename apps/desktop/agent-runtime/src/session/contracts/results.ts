export type RuntimeDisplaySummary = {
  recordId: string;
  targetLeafId: string;
  summary: string;
  timestamp: number;
  generatedAt: number;
  summaryInstruction?: string | null;
  runtimeId?: string | null;
  modelId?: string | null;
  sourceCharCount?: number | null;
  chunkCount?: number | null;
  llmCallCount?: number | null;
  messageCount?: number | null;
  entryCount?: number | null;
};

export type RuntimeLink = {
  linkId: string;
  runtime?: string | null;
  runtimeId?: string | null;
  agentRoleId?: string | null;
  agentSessionId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  streamId?: string | null;
  turnId?: string | null;
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  systemMessageRecordId?: string | null;
  userMessageRecordId?: string | null;
  assistantMessageRecordIds: string[];
  requestContextRecordIds: string[];
  runtimeInstructionRecordIds: string[];
  messageRecordIds: string[];
  status?: "running" | "done" | "error" | null;
  startedAt?: number | null;
  endedAt?: number | null;
};

export type RuntimeSessionResultMessage = {
  messageRecordId: string;
  role: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown> | null;
};

export type RuntimeSessionResultAuxiliaryEntry = {
  recordId: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown> | null;
};

export type SessionResult = {
  type: "session_result";
  requestId?: string | null;
  sessionRootDir: string;
  summary: string;
  messages: RuntimeSessionResultMessage[];
  requestContexts?: RuntimeSessionResultAuxiliaryEntry[];
  runtimeInstructions?: RuntimeSessionResultAuxiliaryEntry[];
  displaySummary?: RuntimeDisplaySummary | null;
  displaySummaries?: RuntimeDisplaySummary[];
  runtimeLinks?: RuntimeLink[];
};

export type SessionMutationResult = Omit<SessionResult, "type"> & {
  type: "session_mutation_result";
  messageRecordId?: string | null;
  messageRecordIds?: string[];
  compacted?: boolean;
  rebuilt?: boolean;
  displaySummary?: RuntimeDisplaySummary | null;
};
