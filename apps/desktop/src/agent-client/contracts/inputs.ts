import type {
  RuntimeAgentToolName,
  RuntimeModelInput,
} from "@/agent-client/protocol";
import type { AgentClientSession } from "./session";

export type AgentClientAgentTaskInput = {
  agentId?: string | null;
  workspacePath: string;
  sessionRootDir?: string | null;
  agentRoleId?: string | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: RuntimeAgentToolName[];
  enabledSkills?: string[];
};

export type AgentClientAgentTask = {
  taskId: string;
};

export type AgentClientCollaborationAgentRole = {
  id: string;
  label: string;
  agentId?: string | null;
  systemPrompt?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: RuntimeAgentToolName[];
  enabledSkills?: string[];
};

export type AgentClientCollaborationWorkflowExecutionMode = "serial" | "parallel";

export type AgentClientCollaborationExecutorId =
  | "native"
  | "langgraph"
  | (string & {});

export type AgentClientCollaborationStepCondition = {
  ref: string;
  equals?: unknown;
  notEquals?: unknown;
  exists?: boolean;
  truthy?: boolean;
  includes?: unknown;
} | {
  condition: string;
  input?: unknown;
  invert?: boolean;
};

export type AgentClientCollaborationStepType =
  | "agent"
  | "transform"
  | "condition"
  | "router";

export type AgentClientCollaborationBaseWorkflowStep = {
  id: string;
  type: AgentClientCollaborationStepType;
  dependsOn?: string[];
  when?: AgentClientCollaborationStepCondition | null;
  label?: string | null;
  outputKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AgentClientCollaborationAgentWorkflowStep =
  AgentClientCollaborationBaseWorkflowStep & {
  type: "agent";
  agentRoleId: string;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: RuntimeAgentToolName[];
  enabledSkills?: string[];
  maxRetries?: number | null;
};

export type AgentClientCollaborationTransformWorkflowStep =
  AgentClientCollaborationBaseWorkflowStep & {
  type: "transform";
  transform: string;
  input?: unknown;
};

export type AgentClientCollaborationConditionWorkflowStep =
  AgentClientCollaborationBaseWorkflowStep & {
  type: "condition";
  condition: string;
  input?: unknown;
};

export type AgentClientCollaborationRouterWorkflowStep =
  AgentClientCollaborationBaseWorkflowStep & {
  type: "router";
  router: string;
  input?: unknown;
  routes?: Record<string, string>;
  fallbackRoute?: string | null;
};

export type AgentClientCollaborationWorkflowStep =
  | AgentClientCollaborationAgentWorkflowStep
  | AgentClientCollaborationTransformWorkflowStep
  | AgentClientCollaborationConditionWorkflowStep
  | AgentClientCollaborationRouterWorkflowStep;

export type AgentClientCollaborationWorkflowDefinition = {
  id: string;
  label?: string | null;
  version?: string | null;
  executor?: AgentClientCollaborationExecutorId | null;
  executionMode?: AgentClientCollaborationWorkflowExecutionMode | null;
  maxSteps?: number | null;
  steps: AgentClientCollaborationWorkflowStep[];
  metadata?: Record<string, unknown> | null;
};

export type AgentClientCollaborationInput = {
  type: "collaboration";
  workspacePath: string;
  sessionRootDir?: string | null;
  workflow: AgentClientCollaborationWorkflowDefinition;
  agents: AgentClientCollaborationAgentRole[];
  input?: unknown;
  allowedTools?: RuntimeAgentToolName[];
  enabledSkills?: string[];
};

export type AgentClientChatMessage = {
  role: string;
  content: string;
};

export type AgentClientChatInput = {
  type: "chat";
  agentId?: string | null;
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  systemPrompt: string;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  messages?: AgentClientChatMessage[];
  stream?: boolean;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type AgentClientAgentInput = AgentClientAgentTaskInput & {
  type: "agent";
};

export type AgentClientRuntimeInput =
  | AgentClientAgentInput
  | AgentClientChatInput
  | AgentClientCollaborationInput;

export type AgentClientChatResult = {
  text: string;
  thinking?: string | null;
  agentSession?: AgentClientSession | null;
};
