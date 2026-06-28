import type {
  RuntimeModelInput,
} from "../../agent-engine/contracts/model.js";
import type {
  BridgeRuntimeResources,
} from "../../agent-engine/contracts/protocol.js";
import type {
  AgentToolName,
} from "../../agent-engine/tools/definitions.js";
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
  resources?: BridgeRuntimeResources | null;
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
  resources?: BridgeRuntimeResources | null;
  input?: unknown;
};
