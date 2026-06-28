import { randomUUID } from "node:crypto";
import { messageFromError } from "../agent-engine/utils/error.js";
import type {
  CollaborationEvent,
  CollaborationEngine,
  CollaborationExecutor,
  CollaborationExecutorId,
  CollaborationRunContext,
  CollaborationRunInput,
  CollaborationRunResult,
  CollaborationWorkflowStep,
  RunAgentForCollaboration,
} from "./contracts.js";
import { CollaborationEventType } from "./contracts.js";
import {
  createLangGraphCollaborationExecutor,
  createNativeCollaborationExecutor,
  langGraphCollaborationExecutorId,
} from "./executors/index.js";

export type CollaborationEngineOptions = {
  runAgent: RunAgentForCollaboration;
  executors?: readonly CollaborationExecutor[];
  defaultExecutorId?: CollaborationExecutorId;
};

export const createCollaborationEngine = ({
  defaultExecutorId = langGraphCollaborationExecutorId,
  executors = [],
  runAgent,
}: CollaborationEngineOptions): CollaborationEngine => {
  const executorById = createExecutorRegistry([
    createNativeCollaborationExecutor(),
    createLangGraphCollaborationExecutor(),
    ...executors,
  ]);

  return {
    async run(
      input: CollaborationRunInput,
      context: CollaborationRunContext = {},
    ): Promise<CollaborationRunResult> {
      const workflowRunId = createCollaborationRunId();
      const steps = input.workflow.steps ?? [];
      if (steps.length === 0) {
        throw new Error(`协作 workflow 未配置 steps：${input.workflow.id}`);
      }

      validateWorkflowSteps(input.workflow.id, steps);

      const executorId = resolveExecutorId(input.workflow.executor, defaultExecutorId);
      const executor = executorById.get(executorId);
      if (!executor) {
        throw new Error(`协作 workflow 指定了未注册的 executor：${executorId}`);
      }

      const emit = (event: CollaborationEvent) => context.emit?.(event);
      emit({
        type: CollaborationEventType.WorkflowStarted,
        workflowRunId,
        workflowId: input.workflow.id,
        executorId,
      });

      try {
        const result = await executor.run({
          input,
          context,
          workflowRunId,
          executorId,
          emit,
          runAgent,
        });
        const normalizedResult = normalizeExecutorResult(result, workflowRunId, executorId);
        emit({
          type: CollaborationEventType.WorkflowDone,
          workflowRunId,
          result: normalizedResult,
        });
        return normalizedResult;
      } catch (error: unknown) {
        const metadata = getErrorMetadata(error);
        emit({
          type: CollaborationEventType.Error,
          workflowRunId,
          stepId: metadata.stepId,
          agentRoleId: metadata.agentRoleId,
          agentTaskId: metadata.agentTaskId,
          message: messageFromError(error),
        });
        throw error;
      }
    },
  };
};

export const createCollaborationRunId = () => `workflow-${randomUUID()}`;

const createExecutorRegistry = (
  executors: readonly CollaborationExecutor[],
) => {
  const executorById = new Map<string, CollaborationExecutor>();
  for (const executor of executors) {
    executorById.set(executor.id, executor);
  }
  return executorById;
};

const resolveExecutorId = (
  executorId: CollaborationExecutorId | null | undefined,
  defaultExecutorId: CollaborationExecutorId,
) => {
  const normalized = typeof executorId === "string" ? executorId.trim() : "";
  return normalized || defaultExecutorId;
};

const normalizeExecutorResult = (
  result: CollaborationRunResult,
  workflowRunId: string,
  executorId: string,
): CollaborationRunResult => ({
  ...result,
  workflowRunId,
  executorId: result.executorId ?? executorId,
});

const validateWorkflowSteps = (
  workflowId: string,
  steps: readonly CollaborationWorkflowStep[],
) => {
  const stepIds = new Set<string>();
  for (const step of steps) {
    if (stepIds.has(step.id)) {
      throw new Error(`协作 workflow step id 重复：${workflowId}/${step.id}`);
    }
    stepIds.add(step.id);
  }

  for (const step of steps) {
    for (const dependencyId of step.dependsOn ?? []) {
      if (dependencyId === step.id) {
        throw new Error(`协作 step 不能依赖自身：${step.id}`);
      }
      if (!stepIds.has(dependencyId)) {
        throw new Error(`协作 step 引用了不存在的 dependsOn：${step.id} -> ${dependencyId}`);
      }
    }
  }
};

const getErrorMetadata = (
  error: unknown,
): {
  stepId?: string;
  agentRoleId?: string;
  agentTaskId?: string;
} => {
  if (!error || typeof error !== "object") {
    return {};
  }
  const candidate = error as {
    stepId?: unknown;
    agentRoleId?: unknown;
    agentTaskId?: unknown;
  };
  return {
    stepId: typeof candidate.stepId === "string" ? candidate.stepId : undefined,
    agentRoleId: typeof candidate.agentRoleId === "string"
      ? candidate.agentRoleId
      : undefined,
    agentTaskId: typeof candidate.agentTaskId === "string"
      ? candidate.agentTaskId
      : undefined,
  };
};
