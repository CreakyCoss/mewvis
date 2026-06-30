import type {
  AgentRuntimeResources,
  ChatMessageInput,
} from "./agent.js";
import type { RuntimeModelInput } from "../models/types.js";
import type {
  CollaborationModeRunInput,
  CollaborationRunInput,
} from "./collaboration.js";

export type AgentToolsQuery = {
  agentId?: string | null;
};

type SessionTargetShape = {
  workspacePath: string;
  sessionRootDir?: string | null;
};

type RequiredSessionTargetShape = {
  workspacePath: string;
  sessionRootDir: string;
};

type AgentTargetShape = {
  agentId?: string | null;
  agentRoleId?: string | null;
};

type RuntimeOptionsShape = {
  mode?: "chat" | "agent" | null;
  taskId?: string | null;
  streamId?: string | null;
  stream?: boolean;
  model?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
};

type AgentMessageShape = {
  userMessage?: string | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  messages?: ChatMessageInput[];
};

export type SendMessageInput = {
  session: SessionTargetShape;
  agent?: AgentTargetShape | null;
  input: AgentMessageShape & {
    userMessage: string;
  };
  runtime?: RuntimeOptionsShape | null;
};

export type AnswerQuestionInput = {
  taskId: string;
  questionId: string;
  answer: string;
};

export type RunChatInput = {
  session?: SessionTargetShape | null;
  agent?: Pick<AgentTargetShape, "agentId"> | null;
  input: AgentMessageShape;
  runtime?: Pick<RuntimeOptionsShape, "streamId" | "stream" | "model"> | null;
};

type SessionLinkShape = {
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  turnId?: string | null;
};

export type ChatInput = {
  agentId?: string | null;
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  streamId?: string | null;
  stream?: boolean;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt?: string | null;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  recordUserMessage?: boolean | null;
  sessionLink?: SessionLinkShape | null;
  messages: ChatMessageInput[];
};

export type AgentRunInput = {
  agentId?: string | null;
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
  agentId?: string | null;
  agentRoleId: string;
};

export type CompactSessionInput = RequiredSessionTargetShape & {
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
  agent?: Pick<AgentTargetShape, "agentId"> | null;
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
  includeLedger?: boolean | null;
  includeTrace?: boolean | null;
  includeTimeline?: boolean | null;
  timelineLimit?: number | null;
};

export type CollaborationTimelineQuery = RequiredSessionTargetShape & {
  workflowRunId?: string | null;
  limit?: number | null;
};

export type RunCollaborationInput = CollaborationRunInput;
export type RunCollaborationModeInput = CollaborationModeRunInput;
