import type { AgentRuntimeResources, ChatMessageInput } from "../agent/index.js";
import type { CollaborationModeRunInput, CollaborationRunInput } from "../collaboration/index.js";
import type { RuntimeModelInput } from "../model.js";

export type AgentToolsQuery = Record<string, never>;

type RequiredSessionTargetShape = {
  workspacePath: string;
  sessionRootDir: string;
};

type RuntimeOptionsShape = {
  model?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
};

export type AnswerQuestionInput = {
  taskId: string;
  questionId: string;
  answer: string;
};

type SessionLinkShape = {
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  turnId?: string | null;
};

export type ChatInput = {
  streamId?: string | null;
  stream?: boolean;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt?: string | null;
  messages: ChatMessageInput[];
};

export type AgentRunInput = {
  taskId: string;
  workspacePath: string;
  sessionRootDir?: string | null;
  agentRoleId?: string | null;
  userMessage: string;
  recordUserMessage?: boolean | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
  sessionLink?: SessionLinkShape | null;
};

export type CreateSessionInput = RequiredSessionTargetShape & {
  systemPrompt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ReadSessionInput = RequiredSessionTargetShape;

type CompactTargetShape = {
  scope: "agent";
  agentRoleId: string;
};

export type CompactAgentSessionInput = RequiredSessionTargetShape & {
  target: CompactTargetShape;
  options?: {
    compactInstruction?: string | null;
  } | null;
  runtime?: Pick<RuntimeOptionsShape, "model" | "resources"> | null;
};

export type RebuildAgentSessionInput = RequiredSessionTargetShape & {
  target: CompactTargetShape;
  options?: {
    rebuildInstruction?: string | null;
    userMessage?: string | null;
  } | null;
  runtime?: Pick<RuntimeOptionsShape, "model" | "resources"> | null;
};

export type SummarizeSessionInput = RequiredSessionTargetShape & {
  options?: {
    summaryInstruction?: string | null;
    maxSummaryChars?: number | null;
  } | null;
  runtime?: Pick<RuntimeOptionsShape, "model"> | null;
};

export type SummarizeAgentSessionInput = RequiredSessionTargetShape & {
  target: CompactTargetShape;
  options?: {
    summaryInstruction?: string | null;
    maxSummaryChars?: number | null;
  } | null;
  runtime?: Pick<RuntimeOptionsShape, "model"> | null;
};

export type EditSessionMessageInput = RequiredSessionTargetShape & {
  messageRecordId: string;
  content: string;
};

export type DeleteSessionMessageInput = RequiredSessionTargetShape & {
  messageRecordId: string;
};

type SessionMessageShape = {
  role: string;
  content: string;
  timestamp?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type AppendSessionMessagesInput = RequiredSessionTargetShape & {
  messages: SessionMessageShape[];
};

export type RebuildSessionInput = RequiredSessionTargetShape & {
  messages: SessionMessageShape[];
};

export type RuntimeSessionsQuery = {
  workspacePath: string;
  rootDir: string;
  limit?: number | null;
  maxDepth?: number | null;
};

export type RuntimeSessionQuery = RequiredSessionTargetShape & {
  includeTimeline?: boolean | null;
  timelineLimit?: number | null;
};

export type RuntimeSessionDebugQuery = RequiredSessionTargetShape & {
  includeLedger?: boolean | null;
  includeTrace?: boolean | null;
  traceLimit?: number | null;
};

export type CollaborationTimelineQuery = RequiredSessionTargetShape & {
  workflowRunId?: string | null;
  limit?: number | null;
};

export type RunCollaborationInput = CollaborationRunInput;
export type RunCollaborationModeInput = CollaborationModeRunInput;
