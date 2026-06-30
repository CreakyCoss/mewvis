import type {
  RuntimeModelInput,
} from "../../agent/contracts/model.js";
import type {
  AgentRuntimeResources,
} from "../../agent/contracts/resources.js";
import type {
  AgentToolName,
} from "../../agent/tools/definitions.js";
import type {
  CollaborationWorkflowStep,
} from "./step.js";

export type CollaborationAgentRole = {
  id: string;
  label: string;
  agentId?: string | null;
  systemPrompt?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
  resources?: AgentRuntimeResources | null;
};

export type CollaborationWorkflowExecutionMode = "serial" | "parallel";

export type CollaborationExecutorId = "native" | "langgraph" | (string & {});

export type CollaborationWorkflowDefinition = {
  id: string;
  label?: string | null;
  version?: string | null;
  executor?: CollaborationExecutorId | null;
  executionMode?: CollaborationWorkflowExecutionMode | null;
  maxSteps?: number | null;
  steps?: readonly CollaborationWorkflowStep[];
  metadata?: Record<string, unknown> | null;
};

export type CollaborationRunInput = {
  requestId?: string | null;
  workspacePath: string;
  sessionRootDir?: string | null;
  workflow: CollaborationWorkflowDefinition;
  agents: readonly CollaborationAgentRole[];
  resources?: AgentRuntimeResources | null;
  input?: unknown;
};
