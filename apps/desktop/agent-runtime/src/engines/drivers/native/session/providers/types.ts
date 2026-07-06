import type {
  AgentEvent,
  MessageAppendCommand,
  MessageDeleteCommand,
  MessageEditCommand,
  ReadSessionCommand,
  RebuildCommand,
  SessionMutationResult,
  SessionResult,
  SummarizeSessionCommand,
} from "../../../../protocol/index.js";
import type {
  RuntimeAgentVisibleContext,
  RuntimeMessageSource,
  RuntimeSessionRecordRef,
  RuntimeSessionContextView,
} from "../model/context.js";
import type {
  RuntimeSessionDebugSnapshot,
  RuntimeSessionSummary,
  RuntimeSessionTimelineItem,
} from "../../../../protocol/session.js";
import type { RuntimeSessionCommand, SessionBackedRuntimeCommand } from "../model/runtime-command.js";

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
  timeline?: RuntimeSessionTimelineItem[];
};

export type RuntimeSessionListOptions = {
  workspacePath: string;
  rootDir: string;
  limit?: number | null;
  maxDepth?: number | null;
};

export type RuntimeSessionMutationHooks = {
  invalidateDerivedArtifacts?(input: RuntimeSessionPathInput): Promise<void>;
};

export type RuntimeSessionCompactInput = RuntimeSessionPathInput & {
  requestId?: string | null;
  summary?: string | null;
  details?: unknown;
};

export type RuntimeSessionDeleteInput = RuntimeSessionPathInput & {
  requestId?: string | null;
};

export type RuntimeSessionAgentVisibleContextInput = RuntimeSessionPathInput & {
  agentRoleId: string;
  anchorRecordId?: string | null;
};

export type RuntimeSessionEventInput = RuntimeSessionPathInput & {
  requestId?: string | null;
  eventType: string;
  data?: unknown;
  metadataSource?: RuntimeMessageSource | null;
  result?: Partial<Pick<SessionMutationResult, "compacted" | "rebuilt">>;
};

export type RuntimeSessionTraceInput<TRecord extends RuntimeSessionTraceRecord> = RuntimeSessionPathInput & {
  record: TRecord;
};

export type RuntimeSessionTurnOptions = {
  includeSummary?: boolean;
  preserveRecordUserMessageFalse?: boolean;
};

export type RuntimeSessionPreparedTurn<TCommand extends RuntimeSessionCommand> = {
  command: TCommand;
  contextAnchorId: string | null;
  runtimeParentRecordId?: string | null;
  sessionContext: RuntimeSessionContextView;
  systemPrompt: string;
  updatedSessionContext: RuntimeSessionContextView;
};

export type RuntimeSessionArtifactInput = RuntimeSessionPathInput & {
  segments: string[];
};

export type RuntimeSessionAssistantMessageInput = {
  text?: string | null;
  thinking?: string | null;
  runStatus?: "done" | "error";
};

export type RuntimeSessionRunRecorder = {
  recordInitialUserMessage(): Promise<void>;
  recordEvent(event: AgentEvent): Promise<void>;
  finalizeAssistantMessage(input?: RuntimeSessionAssistantMessageInput): Promise<void>;
  getSessionRecord(): RuntimeSessionRecordRef;
  flush(): Promise<void>;
};

export type RuntimeSessionProvider = {
  readonly id: RuntimeSessionProviderId;
  initSession(input: RuntimeSessionPathInput): Promise<void>;
  refreshSession(input: RuntimeSessionPathInput): Promise<void>;
  createRecorder(input: SessionBackedRuntimeCommand): Promise<RuntimeSessionRunRecorder>;
  prepareTurn<TCommand extends RuntimeSessionCommand>(
    input: TCommand & RuntimeSessionPathInput,
    options?: RuntimeSessionTurnOptions,
  ): Promise<RuntimeSessionPreparedTurn<TCommand> | null>;
  readSession(input: ReadSessionCommand): Promise<SessionResult>;
  summarizeSession(input: SummarizeSessionCommand): Promise<SessionMutationResult>;
  appendSessionMessages(input: MessageAppendCommand): Promise<SessionMutationResult>;
  rebuildSession(input: RebuildCommand): Promise<SessionMutationResult>;
  editSessionMessage(input: MessageEditCommand): Promise<SessionMutationResult>;
  deleteSessionMessage(input: MessageDeleteCommand): Promise<SessionMutationResult>;
  compactSession(input: RuntimeSessionCompactInput): Promise<SessionMutationResult>;
  deleteSession(input: RuntimeSessionDeleteInput): Promise<void>;
  readAgentVisibleContext(input: RuntimeSessionAgentVisibleContextInput): Promise<RuntimeAgentVisibleContext>;
  recordSessionEvent(input: RuntimeSessionEventInput): Promise<SessionMutationResult>;
  appendTraceRecord<TRecord extends RuntimeSessionTraceRecord>(
    input: RuntimeSessionTraceInput<TRecord>,
  ): Promise<TRecord>;
  resolveArtifactDir(input: RuntimeSessionArtifactInput): Promise<string>;
  clearArtifactDir(input: RuntimeSessionArtifactInput): Promise<void>;
  listRuntimeSessions(input: RuntimeSessionListOptions): Promise<RuntimeSessionSummary[]>;
  getRuntimeSessionSnapshot(
    target: RuntimeSessionQueryTarget,
    options?: {
      includeTimeline?: boolean | null;
      timelineLimit?: number | null;
    },
  ): Promise<RuntimeSessionSnapshot>;
  getRuntimeSessionDebugSnapshot(
    target: RuntimeSessionQueryTarget,
    options?: {
      includeLedger?: boolean | null;
      includeTrace?: boolean | null;
      traceLimit?: number | null;
    },
  ): Promise<RuntimeSessionDebugSnapshot>;
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
