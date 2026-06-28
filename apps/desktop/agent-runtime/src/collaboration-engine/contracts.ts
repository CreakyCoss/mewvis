import type {
  RuntimeModelInput,
} from "../agent-engine/contracts/model.js";
import type {
  AgentToolName,
} from "../agent-engine/tools/definitions.js";
import type {
  BridgeEvent,
  BridgeRuntimeResources,
} from "../agent-engine/contracts/protocol.js";
import type {
  AgentRunCommand,
  AgentRunResult,
  AgentRuntimeContext,
  AskUser,
} from "../agent-engine/runtimes/types.js";

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

export type CollaborationStepCondition = {
  ref: string;
  equals?: unknown;
  notEquals?: unknown;
  exists?: boolean;
  truthy?: boolean;
  includes?: unknown;
};

export type CollaborationWorkflowStep = {
  id: string;
  type: "agent";
  agentRoleId: string;
  userMessage: string;
  dependsOn?: string[];
  when?: CollaborationStepCondition | null;
  label?: string | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  bootstrapInstruction?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  allowedTools?: AgentToolName[];
  enabledSkills?: string[];
  resources?: BridgeRuntimeResources | null;
  maxRetries?: number | null;
  outputKey?: string | null;
};

export type CollaborationWorkflowExecutionMode = "serial" | "parallel";

export type CollaborationExecutorId = "native" | "langgraph" | (string & {});

export type CollaborationWorkflowDefinition = {
  id: string;
  label?: string | null;
  version?: string | null;
  executor?: CollaborationExecutorId | null;
  executionMode?: CollaborationWorkflowExecutionMode | null;
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

export type CollaborationStepResult = {
  stepId: string;
  agentRoleId: string;
  agentTaskId: string;
  outputKey: string;
  text: string;
};

export type CollaborationSkippedStepResult = {
  stepId: string;
  reason: string;
  condition?: CollaborationStepCondition | null;
};

export type CollaborationRunResult = {
  workflowRunId: string;
  executorId?: string;
  steps: CollaborationStepResult[];
  skippedSteps?: CollaborationSkippedStepResult[];
  output?: unknown;
};

export enum CollaborationEventType {
  WorkflowStarted = "workflow_started",
  StepStarted = "step_started",
  AgentEvent = "agent_event",
  StepDone = "step_done",
  StepSkipped = "step_skipped",
  WorkflowDone = "workflow_done",
  Error = "error",
}

export type CollaborationEvent =
  | {
    type: CollaborationEventType.WorkflowStarted;
    workflowRunId: string;
    workflowId: string;
    executorId: string;
  }
  | {
    type: CollaborationEventType.StepStarted;
    workflowRunId: string;
    stepId: string;
    agentRoleId: string;
    agentTaskId: string;
  }
  | {
    type: CollaborationEventType.AgentEvent;
    workflowRunId: string;
    stepId: string;
    agentRoleId: string;
    agentTaskId: string;
    event: BridgeEvent;
  }
  | {
    type: CollaborationEventType.StepDone;
    workflowRunId: string;
    step: CollaborationStepResult;
  }
  | {
    type: CollaborationEventType.StepSkipped;
    workflowRunId: string;
    step: CollaborationSkippedStepResult;
  }
  | {
    type: CollaborationEventType.WorkflowDone;
    workflowRunId: string;
    result: CollaborationRunResult;
  }
  | {
    type: CollaborationEventType.Error;
    workflowRunId: string;
    stepId?: string;
    agentRoleId?: string;
    agentTaskId?: string;
    message: string;
  };

export type EmitCollaborationEvent = (event: CollaborationEvent) => void;

export type CollaborationRunContext = {
  askUser?: AskUser;
  emit?: EmitCollaborationEvent;
};

export type RunAgentForCollaboration = (
  command: AgentRunCommand,
  context: AgentRuntimeContext,
) => Promise<AgentRunResult>;

export type CollaborationExecutorRunInput = {
  input: CollaborationRunInput;
  context: CollaborationRunContext;
  workflowRunId: string;
  executorId: string;
  emit: EmitCollaborationEvent;
  runAgent: RunAgentForCollaboration;
};

export type CollaborationExecutor = {
  id: CollaborationExecutorId;
  run(input: CollaborationExecutorRunInput): Promise<CollaborationRunResult>;
};

export type CollaborationEngine = {
  run(
    input: CollaborationRunInput,
    context?: CollaborationRunContext,
  ): Promise<CollaborationRunResult>;
};
