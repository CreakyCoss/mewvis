import type {
  RuntimeModelInput,
} from "@/agent-client/protocol";
import type { AgentClientSession } from "./session";

export type AgentClientAgentTaskInput = {
  workspacePath: string;
  sessionRootDir?: string | null;
  agentRoleId?: string | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
};

export type AgentClientAgentTask = {
  taskId: string;
};

export type AgentClientCollaborationAgentRole = {
  id: string;
  label: string;
  systemPrompt?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
};

export type AgentClientCollaborationWorkflowExecutionMode = "serial" | "parallel";

export type AgentClientCollaborationRuntimeId =
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
  | "dispatch"
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
  allowedTools?: string[];
  enabledSkills?: string[];
  maxRetries?: number | null;
};

export type AgentClientCollaborationDispatchMode = "serial" | "parallel";

export type AgentClientCollaborationAgentInvocation = {
  id?: string | null;
  label?: string | null;
  agentRoleId: string;
  outputKey?: string | null;
  userMessage: string;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
  metadata?: Record<string, unknown> | null;
  maxRetries?: number | null;
};

export type AgentClientCollaborationDispatchWorkflowStep =
  AgentClientCollaborationBaseWorkflowStep & {
  type: "dispatch";
  input?: unknown;
  mode?: AgentClientCollaborationDispatchMode | null;
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
  | AgentClientCollaborationDispatchWorkflowStep
  | AgentClientCollaborationTransformWorkflowStep
  | AgentClientCollaborationConditionWorkflowStep
  | AgentClientCollaborationRouterWorkflowStep;

export type AgentClientCollaborationWorkflowDefinition = {
  id: string;
  label?: string | null;
  version?: string | null;
  runtime?: AgentClientCollaborationRuntimeId | null;
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
  allowedTools?: string[];
  enabledSkills?: string[];
};

export type AgentClientCollaborationModeId =
  | "supervisor.dispatch-loop"
  | "producer.review-rewrite-loop"
  | (string & {});

export type AgentClientCollaborationParticipantKind =
  | "supervisor"
  | "worker"
  | "producer"
  | "reviewer"
  | "evaluator";

export type AgentClientCollaborationModeParticipant = {
  id: string;
  kind: AgentClientCollaborationParticipantKind;
  label?: string | null;
  systemPrompt?: string | null;
  instruction?: string | null;
  userMessage?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: string[];
  enabledSkills?: string[];
  capabilities?: string[];
  metadata?: Record<string, unknown> | null;
};

export type AgentClientCollaborationModeInput = {
  type: "collaborationMode";
  workspacePath: string;
  sessionRootDir?: string | null;
  mode: AgentClientCollaborationModeId;
  participants: AgentClientCollaborationModeParticipant[];
  context?: unknown;
  options?: Record<string, unknown> | null;
  runtime?: AgentClientCollaborationRuntimeId | null;
  allowedTools?: string[];
  enabledSkills?: string[];
};

export type AgentClientChatMessage = {
  role: string;
  content: string;
};

export type AgentClientChatInput = {
  type: "chat";
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
  | AgentClientCollaborationModeInput
  | AgentClientCollaborationInput;

export type AgentClientChatResult = {
  text: string;
  thinking?: string | null;
  agentSession?: AgentClientSession | null;
};
