import type {
  AgentEvent,
} from "../../agent/contracts/events.js";
import type {
  CollaborationRunResult,
  CollaborationSkippedStepResult,
  CollaborationStepResult,
} from "./state.js";
import type {
  CollaborationStepType,
} from "./step.js";

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
    stepType: CollaborationStepType;
    agentRoleId?: string;
    agentTaskId?: string;
  }
  | {
    type: CollaborationEventType.AgentEvent;
    workflowRunId: string;
    stepId: string;
    agentRoleId: string;
    agentTaskId: string;
    event: AgentEvent;
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
