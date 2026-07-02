import type {
  CollaborationEvent,
  CollaborationConditionWorkflowStep,
  CollaborationRouterWorkflowStep,
  CollaborationRunInput,
  CollaborationTransformWorkflowStep,
  CollaborationWorkflowStep,
} from "../../../../protocol/index.js";
import type {
  CollaborationExecutionState,
} from "../runtimes/shared/execution-state.js";

export type EmitCollaborationEvent = (event: CollaborationEvent) => void;

export type CollaborationHandlerContext<
  TStep extends CollaborationWorkflowStep = CollaborationWorkflowStep,
> = {
  input: CollaborationRunInput;
  state: CollaborationExecutionState;
  step: TStep;
  workflowRunId: string;
  emit: EmitCollaborationEvent;
};

export type CollaborationTransformHandler = (
  input: unknown,
  context: CollaborationHandlerContext<CollaborationTransformWorkflowStep>,
) => unknown | Promise<unknown>;

export type CollaborationConditionHandler = (
  input: unknown,
  context: CollaborationHandlerContext<
    CollaborationConditionWorkflowStep | CollaborationWorkflowStep
  >,
) => boolean | Promise<boolean>;

export type CollaborationRouterResult =
  | string
  | null
  | {
    route?: string | null;
    output?: unknown;
  };

export type CollaborationRouterHandler = (
  input: unknown,
  context: CollaborationHandlerContext<CollaborationRouterWorkflowStep>,
) => CollaborationRouterResult | Promise<CollaborationRouterResult>;

export type CollaborationHandlerBundle = {
  id?: string;
  namespace?: string;
  transforms?: Record<string, CollaborationTransformHandler>;
  conditions?: Record<string, CollaborationConditionHandler>;
  routers?: Record<string, CollaborationRouterHandler>;
};

export type CollaborationHandlerRegistry = {
  getTransform(id: string): CollaborationTransformHandler | undefined;
  requireTransform(id: string): CollaborationTransformHandler;
  getCondition(id: string): CollaborationConditionHandler | undefined;
  requireCondition(id: string): CollaborationConditionHandler;
  getRouter(id: string): CollaborationRouterHandler | undefined;
  requireRouter(id: string): CollaborationRouterHandler;
  list(): {
    transforms: string[];
    conditions: string[];
    routers: string[];
  };
};

export type EmitHandlerEvent = (event: CollaborationEvent) => void;
