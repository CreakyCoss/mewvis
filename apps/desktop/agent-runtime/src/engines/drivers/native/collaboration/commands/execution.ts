import { messageFromError } from "../../error.js";
import {
  CollaborationEventType,
  type CollaborationEvent,
  type CollaborationRunInput,
  type CollaborationRunResult,
} from "../../../../protocol/index.js";
import type {
  CollaborationRuntime,
  CollaborationRuntimeId,
  CollaborationRunContext,
  RunAgentForCollaboration,
} from "../runtimes/types.js";
import { createCollaborationRuntimeResolver } from "../runtimes/resolver.js";
import {
  createCollaborationModeRegistry,
  type CollaborationModeDefinition,
  type CollaborationModeRegistry,
  type CollaborationModeRunInput,
  type CollaborationModeRunResult,
} from "../modes/index.js";
import { createBuiltinCollaborationModeHandlers } from "../handlers/builtin.js";
import { createCollaborationHandlerRegistry } from "../handlers/registry.js";
import { createCollaborationRunId } from "../utils/ids.js";
import { CollaborationSessionRecorder } from "./recorder.js";
import { validateWorkflowSteps } from "./validation.js";
import type { RuntimeSessionProviderId } from "../../session/providers/types.js";

export type CollaborationCommandExecutionOptions = {
  runAgent: RunAgentForCollaboration;
  runtimes?: readonly CollaborationRuntime[];
  defaultRuntimeId?: CollaborationRuntimeId | null;
  modes?: readonly CollaborationModeDefinition[];
  modeRegistry?: CollaborationModeRegistry;
  sessionProviderId?: RuntimeSessionProviderId | null;
};

export const executeCollaborationRunCommand = async (
  input: CollaborationRunInput,
  context: CollaborationRunContext = {},
  { defaultRuntimeId, runtimes = [], runAgent, sessionProviderId }: CollaborationCommandExecutionOptions,
): Promise<CollaborationRunResult> => {
  const runtimeResolver = createCollaborationRuntimeResolver({
    defaultRuntimeId,
    runtimes,
  });
  const resolvedHandlerRegistry = createCollaborationHandlerRegistry([createBuiltinCollaborationModeHandlers()]);

  const workflowRunId = createCollaborationRunId();
  assertNoRuntimeOverride(input.workflow, "协作 workflow");
  const steps = input.workflow.steps ?? [];
  if (steps.length === 0) {
    throw new Error(`协作 workflow 未配置 steps：${input.workflow.id}`);
  }

  validateWorkflowSteps(input.workflow.id, steps);

  const runtime = runtimeResolver.resolve();
  const runtimeId = runtime.id;

  const recorder = await CollaborationSessionRecorder.create(input, runtimeId, sessionProviderId);
  const emit = recorder
    ? recorder.wrapEmit((event: CollaborationEvent) => context.emit?.(event))
    : (event: CollaborationEvent) => context.emit?.(event);
  emit({
    type: CollaborationEventType.WorkflowStarted,
    workflowRunId,
    workflowId: input.workflow.id,
  });

  try {
    const result = await runtime.run({
      input,
      context,
      workflowRunId,
      runtimeId,
      emit,
      runAgent,
      handlerRegistry: resolvedHandlerRegistry,
    });
    const normalizedResult = normalizeRuntimeResult(result, workflowRunId);
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

export const executeCollaborationModeCommand = async (
  input: CollaborationModeRunInput,
  context: CollaborationRunContext = {},
  options: CollaborationCommandExecutionOptions,
): Promise<CollaborationModeRunResult> => {
  assertNoRuntimeOverride(input, "协作 mode");
  const mode = resolveCollaborationModeRegistry(options).require(input.mode);
  const result = await executeCollaborationRunCommand(mode.build(input), context, options);
  return {
    ...result,
    mode: mode.id,
  };
};

export const listCollaborationModes = (
  options: Pick<CollaborationCommandExecutionOptions, "modes" | "modeRegistry"> = {},
) => resolveCollaborationModeRegistry(options).list();

const resolveCollaborationModeRegistry = (
  options: Pick<CollaborationCommandExecutionOptions, "modes" | "modeRegistry">,
) => options.modeRegistry ?? createCollaborationModeRegistry(options.modes);

const hasOwn = (value: unknown, key: string) =>
  Boolean(value) && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);

const assertNoRuntimeOverride = (value: unknown, label: string) => {
  if (hasOwn(value, "runtime")) {
    throw new Error(`${label} 不再接受 runtime 字段；协作 runtime 由 native profile 决定`);
  }
};

const normalizeRuntimeResult = (result: CollaborationRunResult, workflowRunId: string): CollaborationRunResult => ({
  ...result,
  workflowRunId,
});

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
    agentRoleId: typeof candidate.agentRoleId === "string" ? candidate.agentRoleId : undefined,
    agentTaskId: typeof candidate.agentTaskId === "string" ? candidate.agentTaskId : undefined,
  };
};
