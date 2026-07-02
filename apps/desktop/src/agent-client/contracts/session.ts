export type AgentClientSession = {
  sessionRootDir: string;
  userMessageRecordId?: string | null;
  requestContextRecordId?: string | null;
  runtimeInstructionRecordId?: string | null;
  assistantMessageRecordId?: string | null;
};

export type AgentClientRuntimeSessionSummary = {
  workspacePath: string;
  sessionRootDir: string;
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

export type AgentClientRuntimeSessionTimelineItem = {
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
};

export type AgentClientRuntimeSessionSnapshot = {
  type?: "runtime_session_result";
  requestId?: string | null;
  session: AgentClientRuntimeSessionSummary;
  timeline?: AgentClientRuntimeSessionTimelineItem[];
};

export type AgentClientRuntimeSessionDebugSnapshot = {
  type?: "runtime_session_debug_result";
  requestId?: string | null;
  session: AgentClientRuntimeSessionSummary;
  ledger?: {
    header: unknown;
    entries: unknown[];
  } | null;
  trace?: unknown[];
};

export type AgentClientRuntimeSessionsResult = {
  type?: "runtime_sessions_result";
  requestId?: string | null;
  sessions: AgentClientRuntimeSessionSummary[];
};

export type AgentClientCollaborationTimelineResult = {
  type?: "collaboration_timeline_result";
  requestId?: string | null;
  session: AgentClientRuntimeSessionSummary;
  workflowRunId?: string | null;
  events: AgentClientRuntimeSessionTimelineItem[];
};

export type AgentClientListRuntimeSessionsInput = {
  workspacePath: string;
  rootDir?: string | null;
  limit?: number | null;
  maxDepth?: number | null;
};

export type AgentClientGetRuntimeSessionInput = {
  workspacePath: string;
  sessionRootDir: string;
  includeTimeline?: boolean | null;
  timelineLimit?: number | null;
};

export type AgentClientGetRuntimeSessionDebugInput = {
  workspacePath: string;
  sessionRootDir: string;
  includeLedger?: boolean | null;
  includeTrace?: boolean | null;
  traceLimit?: number | null;
};

export type AgentClientGetCollaborationTimelineInput = {
  workspacePath: string;
  sessionRootDir: string;
  workflowRunId?: string | null;
  limit?: number | null;
};
