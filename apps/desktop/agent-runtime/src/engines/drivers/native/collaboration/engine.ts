import { randomUUID } from "node:crypto";
import { messageFromError } from "../error.js";
import {
  CollaborationEventType,
  type CollaborationEvent,
  type CollaborationExecutorId,
  type CollaborationRunInput,
  type CollaborationRunResult,
  type CollaborationWorkflowStep,
} from "../../../protocol/index.js";
import type {
  CollaborationEngine,
  CollaborationExecutor,
  CollaborationRunContext,
  RunAgentForCollaboration,
} from "./contracts/executor.js";
import {
  collaborationExecutorManifest,
  createBuiltinCollaborationExecutors,
} from "./executors/index.js";
import {
  createCollaborationModeRegistry,
  type CollaborationModeDefinition,
  type CollaborationModeRegistry,
  type CollaborationModeRunInput,
  type CollaborationModeRunResult,
} from "./modes/index.js";
import { createBuiltinCollaborationModeHandlers } from "./modes/handlers.js";
import { createCollaborationHandlerRegistry } from "./registry/handler-registry.js";
import { CollaborationSessionRecorder } from "./runtime-session-recorder.js";
import type { RuntimeSessionProviderId } from "../session/providers/types.js";

export type CollaborationEngineOptions = {
  runAgent: RunAgentForCollaboration;
  executors?: readonly CollaborationExecutor[];
  defaultExecutorId?: CollaborationExecutorId | null;
  modes?: readonly CollaborationModeDefinition[];
  modeRegistry?: CollaborationModeRegistry;
  sessionProviderId?: RuntimeSessionProviderId | null;
};

export const createCollaborationEngine = ({
  defaultExecutorId = collaborationExecutorManifest.defaultExecutorId,
  executors = [],
  modes,
  modeRegistry,
  runAgent,
  sessionProviderId,
}: CollaborationEngineOptions): CollaborationEngine => {
  const executorById = createExecutorRegistry([
    ...createBuiltinCollaborationExecutors(),
    ...executors,
  ]);
  const resolvedHandlerRegistry = createCollaborationHandlerRegistry([
    createBuiltinCollaborationModeHandlers(),
  ]);
  const resolvedModeRegistry = modeRegistry ?? createCollaborationModeRegistry(modes);

  const run = async (
    input: CollaborationRunInput,
    context: CollaborationRunContext = {},
  ): Promise<CollaborationRunResult> => {
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

      const recorder = await CollaborationSessionRecorder.create(input, sessionProviderId);
      const emit = recorder
        ? recorder.wrapEmit((event: CollaborationEvent) => context.emit?.(event))
        : (event: CollaborationEvent) => context.emit?.(event);
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
          handlerRegistry: resolvedHandlerRegistry,
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
      } finally {
        await recorder?.flush();
      }
  };

  const runMode = async (
    input: CollaborationModeRunInput,
    context: CollaborationRunContext = {},
  ): Promise<CollaborationModeRunResult> => {
    const mode = resolvedModeRegistry.require(input.mode);
    const result = await run(mode.build(input), context);
    return {
      ...result,
      mode: mode.id,
    };
  };

  return {
    listModes: () => resolvedModeRegistry.list(),
    run,
    runMode,
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
  defaultExecutorId: CollaborationExecutorId | null | undefined,
) => {
  const normalized = typeof executorId === "string" ? executorId.trim() : "";
  return normalized || defaultExecutorId || collaborationExecutorManifest.defaultExecutorId;
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
    validateWorkflowStepShape(workflowId, step);

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

const validateWorkflowStepShape = (
  workflowId: string,
  step: CollaborationWorkflowStep,
) => {
  if (!step.id?.trim()) {
    throw new Error(`协作 workflow step id 不能为空：${workflowId}`);
  }

  if (step.type === "agent") {
    if (!step.agentRoleId?.trim()) {
      throw new Error(`协作 agent step 缺少 agentRoleId：${workflowId}/${step.id}`);
    }
    if (typeof step.userMessage !== "string") {
      throw new Error(`协作 agent step 缺少 userMessage：${workflowId}/${step.id}`);
    }
    return;
  }

  if (step.type === "transform") {
    if (!step.transform?.trim()) {
      throw new Error(`协作 transform step 缺少 transform：${workflowId}/${step.id}`);
    }
    return;
  }

  if (step.type === "dispatch") {
    return;
  }

  if (step.type === "condition") {
    if (!step.condition?.trim()) {
      throw new Error(`协作 condition step 缺少 condition：${workflowId}/${step.id}`);
    }
    return;
  }

  if (step.type === "router") {
    if (!step.router?.trim()) {
      throw new Error(`协作 router step 缺少 router：${workflowId}/${step.id}`);
    }
    return;
  }

  const unsupportedStep = step as { id?: string; type?: string };
  throw new Error(
    `协作 workflow step type 不支持：${workflowId}/${unsupportedStep.id ?? "<unknown>"}:${unsupportedStep.type ?? "<unknown>"}`,
  );
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
