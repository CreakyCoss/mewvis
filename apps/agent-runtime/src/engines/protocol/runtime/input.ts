import type { AgentRuntimeResources, RuntimeModelInput } from "../wire.js";

type RequiredSessionTargetShape = {
  workspacePath: string;
  sessionRootDir: string;
};

type RuntimeModelResourcesInput = {
  model?: RuntimeModelInput | null;
  resources?: AgentRuntimeResources | null;
};

type RuntimeIdModelInput = {
  runtimeId?: string | null;
  model?: RuntimeModelInput | null;
};

type RuntimeModelOnlyInput = {
  model?: RuntimeModelInput | null;
};

type CompactTargetShape = {
  scope: "agent";
  agentRoleId: string;
};

export type CompactAgentSessionInput = RequiredSessionTargetShape & {
  target: CompactTargetShape;
  options?: {
    compactInstruction?: string | null;
  } | null;
  runtime?: RuntimeModelResourcesInput | null;
};

export type RebuildAgentSessionInput = RequiredSessionTargetShape & {
  target: CompactTargetShape;
  options?: {
    rebuildInstruction?: string | null;
    userMessage?: string | null;
  } | null;
  runtime?: RuntimeModelResourcesInput | null;
};

export type SummarizeSessionInput = RequiredSessionTargetShape & {
  options?: {
    summaryInstruction?: string | null;
    maxSummaryChars?: number | null;
  } | null;
  runtime?: RuntimeIdModelInput | null;
};

export type SummarizeAgentSessionInput = RequiredSessionTargetShape & {
  target: CompactTargetShape;
  options?: {
    summaryInstruction?: string | null;
    maxSummaryChars?: number | null;
  } | null;
  runtime?: RuntimeModelOnlyInput | null;
};
