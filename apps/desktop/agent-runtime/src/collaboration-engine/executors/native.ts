import type {
  BridgeRuntimeResources,
} from "../../agent-engine/contracts/protocol.js";
import { messageFromError } from "../../agent-engine/utils/error.js";
import type {
  CollaborationAgentRole,
  CollaborationEvent,
  CollaborationExecutor,
  CollaborationExecutorRunInput,
  CollaborationRunContext,
  CollaborationRunInput,
  CollaborationSkippedStepResult,
  CollaborationStepCondition,
  CollaborationStepResult,
  CollaborationWorkflowStep,
  RunAgentForCollaboration,
} from "../contracts.js";
import { CollaborationEventType } from "../contracts.js";

export const nativeCollaborationExecutorId = "native" as const;

export const createNativeCollaborationExecutor = (): CollaborationExecutor => ({
  id: nativeCollaborationExecutorId,
  async run({
    context,
    emit,
    executorId,
    input,
    runAgent,
    workflowRunId,
  }: CollaborationExecutorRunInput) {
    const steps = input.workflow.steps ?? [];
    const roleById = new Map(input.agents.map((role) => [role.id, role]));
    const state = createCollaborationExecutionState(input.input);

    const executeStep = (step: CollaborationWorkflowStep) =>
      runStepWithRetry({
        context,
        emit,
        input,
        roleById,
        runAgent,
        state,
        step,
        workflowRunId,
      });

    if (input.workflow.executionMode === "parallel") {
      await runParallelSteps(steps, executeStep);
    } else {
      for (const step of steps) {
        await executeStep(step);
      }
    }

    return collectCollaborationRunResult({
      executorId,
      state,
      steps,
      workflowRunId,
    });
  },
});

export type CollaborationExecutionState = {
  input: unknown;
  output: Record<string, unknown>;
  stepResultById: Map<string, CollaborationStepResult>;
  skippedStepById: Map<string, CollaborationSkippedStepResult>;
};

type StepExecutionOutcome = CollaborationStepResult | CollaborationSkippedStepResult;

type ExecuteStep = (step: CollaborationWorkflowStep) => Promise<StepExecutionOutcome>;

export type RunStepInput = {
  context: CollaborationRunContext;
  emit: (event: CollaborationEvent) => void;
  input: CollaborationRunInput;
  roleById: Map<string, CollaborationAgentRole>;
  runAgent: RunAgentForCollaboration;
  state: CollaborationExecutionState;
  step: CollaborationWorkflowStep;
  workflowRunId: string;
};

export const createCollaborationExecutionState = (
  input: unknown,
  {
    output = {},
    skippedSteps = [],
    stepResults = [],
  }: {
    output?: Record<string, unknown>;
    skippedSteps?: readonly CollaborationSkippedStepResult[];
    stepResults?: readonly CollaborationStepResult[];
  } = {},
): CollaborationExecutionState => ({
  input,
  output: { ...output },
  stepResultById: new Map(stepResults.map((step) => [step.stepId, step])),
  skippedStepById: new Map(skippedSteps.map((step) => [step.stepId, step])),
});

export const collectCollaborationRunResult = ({
  executorId,
  state,
  steps,
  workflowRunId,
}: {
  executorId: string;
  state: CollaborationExecutionState;
  steps: readonly CollaborationWorkflowStep[];
  workflowRunId: string;
}) => {
  const stepResults = steps.map((step) => state.stepResultById.get(step.id))
    .filter((step): step is CollaborationStepResult => Boolean(step));
  const skippedSteps = steps.map((step) => state.skippedStepById.get(step.id))
    .filter((step): step is CollaborationSkippedStepResult => Boolean(step));

  return {
    workflowRunId,
    executorId,
    steps: stepResults,
    skippedSteps,
    output: state.output,
  };
};

export class CollaborationStepRunError extends Error {
  readonly stepId: string;
  readonly agentRoleId?: string;
  readonly agentTaskId?: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    {
      agentRoleId,
      agentTaskId,
      cause,
      stepId,
    }: {
      agentRoleId?: string;
      agentTaskId?: string;
      cause?: unknown;
      stepId: string;
    },
  ) {
    super(message);
    this.name = "CollaborationStepRunError";
    this.agentRoleId = agentRoleId;
    this.agentTaskId = agentTaskId;
    this.cause = cause;
    this.stepId = stepId;
  }
}

export const runStepWithRetry = async ({
  context,
  emit,
  input,
  roleById,
  runAgent,
  state,
  step,
  workflowRunId,
}: RunStepInput): Promise<StepExecutionOutcome> => {
  if (!shouldRunStep(step, state)) {
    const skippedStep = {
      stepId: step.id,
      reason: "condition_false",
      condition: step.when ?? null,
    };
    state.skippedStepById.set(step.id, skippedStep);
    emit({
      type: CollaborationEventType.StepSkipped,
      workflowRunId,
      step: skippedStep,
    });
    return skippedStep;
  }

  const role = roleById.get(step.agentRoleId);
  if (!role) {
    throw new CollaborationStepRunError(
      `协作 step 引用了不存在的 agentRoleId：${step.agentRoleId}`,
      {
        agentRoleId: step.agentRoleId,
        stepId: step.id,
      },
    );
  }

  const maxRetries = normalizeMaxRetries(step.maxRetries);
  let lastError: unknown;
  let lastAgentTaskId: string | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const agentTaskId = createAgentTaskId(workflowRunId, step.id, attempt);
    lastAgentTaskId = agentTaskId;
    emit({
      type: CollaborationEventType.StepStarted,
      workflowRunId,
      stepId: step.id,
      agentRoleId: role.id,
      agentTaskId,
    });

    try {
      const result = await runAgent(
        buildAgentCommand(input, step, role, agentTaskId, state),
        {
          askUser: context.askUser ?? rejectAskUser,
          emit: (event) => emit({
            type: CollaborationEventType.AgentEvent,
            workflowRunId,
            stepId: step.id,
            agentRoleId: role.id,
            agentTaskId,
            event,
          }),
        },
      );
      const stepResult = {
        stepId: step.id,
        agentRoleId: role.id,
        agentTaskId,
        outputKey: step.outputKey?.trim() || step.id,
        text: result.text,
      };
      state.stepResultById.set(step.id, stepResult);
      state.output[stepResult.outputKey] = result.text;
      emit({
        type: CollaborationEventType.StepDone,
        workflowRunId,
        step: stepResult,
      });
      return stepResult;
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw new CollaborationStepRunError(messageFromError(lastError), {
    agentRoleId: role.id,
    agentTaskId: lastAgentTaskId,
    cause: lastError,
    stepId: step.id,
  });
};

const runParallelSteps = async (
  steps: readonly CollaborationWorkflowStep[],
  executeStep: ExecuteStep,
) => {
  const remainingStepIds = new Set(steps.map((step) => step.id));
  const completedStepIds = new Set<string>();

  while (remainingStepIds.size > 0) {
    const readySteps = steps.filter((step) =>
      remainingStepIds.has(step.id) &&
      (step.dependsOn ?? []).every((stepId) => completedStepIds.has(stepId))
    );
    if (readySteps.length === 0) {
      throw new Error("协作 workflow 存在循环依赖或无法满足的 dependsOn");
    }

    const settled = await Promise.allSettled(
      readySteps.map((step) => executeStep(step)),
    );
    const failed = settled.find((result) => result.status === "rejected");
    for (const result of settled) {
      if (result.status === "fulfilled") {
        completedStepIds.add(result.value.stepId);
        remainingStepIds.delete(result.value.stepId);
      }
    }
    if (failed?.status === "rejected") {
      throw failed.reason;
    }
  }
};

const createAgentTaskId = (workflowRunId: string, stepId: string, attempt = 1) =>
  attempt === 1
    ? `${workflowRunId}:${stepId}`
    : `${workflowRunId}:${stepId}:attempt-${attempt}`;

const normalizeMaxRetries = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

const shouldRunStep = (
  step: CollaborationWorkflowStep,
  state: CollaborationExecutionState,
) => {
  if (!step.when) {
    return true;
  }
  return evaluateCondition(step.when, state);
};

const evaluateCondition = (
  condition: CollaborationStepCondition,
  state: CollaborationExecutionState,
) => {
  const value = resolveTemplateValue(condition.ref, state);
  let matched = true;
  let usedOperator = false;

  if (condition.exists !== undefined) {
    usedOperator = true;
    matched = matched && ((value !== null && value !== undefined) === condition.exists);
  }
  if (condition.truthy !== undefined) {
    usedOperator = true;
    matched = matched && (Boolean(value) === condition.truthy);
  }
  if ("equals" in condition) {
    usedOperator = true;
    matched = matched && valuesEqual(value, condition.equals);
  }
  if ("notEquals" in condition) {
    usedOperator = true;
    matched = matched && !valuesEqual(value, condition.notEquals);
  }
  if ("includes" in condition) {
    usedOperator = true;
    matched = matched && valueIncludes(value, condition.includes);
  }

  return usedOperator ? matched : Boolean(value);
};

const rejectAskUser = async () => {
  throw new Error("collaboration-engine 当前运行上下文未提供 askUser 处理器");
};

const buildAgentCommand = (
  input: CollaborationRunInput,
  step: CollaborationWorkflowStep,
  role: CollaborationAgentRole,
  taskId: string,
  state: CollaborationExecutionState,
) => {
  const roleSystemPrompt = renderOptionalTemplate(
    step.systemPrompt ?? role.systemPrompt ?? null,
    state,
  );
  const runtimeInstruction = renderOptionalTemplate(step.runtimeInstruction ?? null, state);

  return {
    runtimeMode: "agent" as const,
    requestId: input.requestId ?? null,
    agentId: role.agentId ?? null,
    agentRoleId: role.id,
    taskId,
    workspacePath: input.workspacePath,
    sessionRootDir: input.sessionRootDir ?? null,
    userMessage: renderTemplate(step.userMessage, state),
    systemPrompt: null,
    requestContext: renderOptionalTemplate(step.requestContext ?? null, state),
    runtimeInstruction: joinInstructionSections([
      roleSystemPrompt
        ? [
          "<agent_role_system_prompt instruction=\"agent_scoped; treat_as_system_priority_for_this_agent\">",
          roleSystemPrompt,
          "</agent_role_system_prompt>",
        ].join("\n")
        : null,
      runtimeInstruction,
    ]),
    bootstrapInstruction: renderOptionalTemplate(step.bootstrapInstruction ?? null, state),
    runtimeModel: step.runtimeModel ?? role.runtimeModel ?? null,
    resources: mergeRuntimeResources(input.resources ?? null, role, step),
  };
};

const joinInstructionSections = (
  sections: Array<string | null | undefined>,
) => {
  const text = sections.map((section) => section?.trim() ?? "").filter(Boolean).join("\n\n");
  return text || null;
};

const renderOptionalTemplate = (
  value: string | null | undefined,
  state: CollaborationExecutionState,
) => value === null || value === undefined ? null : renderTemplate(value, state);

const renderTemplate = (
  value: string,
  state: CollaborationExecutionState,
) => value.replace(/\{\{\s*([A-Za-z0-9_.:-]+)\s*\}\}/g, (_match, path: string) =>
  stringifyTemplateValue(resolveTemplateValue(path, state))
);

const resolveTemplateValue = (
  path: string,
  state: CollaborationExecutionState,
) => {
  const [root, ...parts] = path.split(".");
  if (root === "input") {
    return getPathValue(state.input, parts);
  }
  if (root === "output") {
    return getPathValue(state.output, parts);
  }
  if (root === "steps") {
    const [stepId, ...stepParts] = parts;
    if (!stepId) {
      return undefined;
    }
    return getPathValue(state.stepResultById.get(stepId), stepParts);
  }
  return undefined;
};

const getPathValue = (value: unknown, parts: string[]): unknown => {
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const stringifyTemplateValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
};

const valuesEqual = (left: unknown, right: unknown) => {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    typeof left === "object" &&
    left !== null &&
    typeof right === "object" &&
    right !== null
  ) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return false;
};

const valueIncludes = (value: unknown, expected: unknown) => {
  if (typeof value === "string" && typeof expected === "string") {
    return value.includes(expected);
  }
  if (Array.isArray(value)) {
    return value.some((item) => valuesEqual(item, expected));
  }
  return false;
};

const mergeRuntimeResources = (
  globalResources: BridgeRuntimeResources | null,
  role: CollaborationAgentRole,
  step: CollaborationWorkflowStep,
): BridgeRuntimeResources | null => {
  const base = {
    ...(globalResources ?? {}),
    ...(role.resources ?? {}),
    ...(step.resources ?? {}),
  };
  const allowedTools = step.allowedTools ?? role.allowedTools;
  const enabledSkills = step.enabledSkills ?? role.enabledSkills;
  if (!allowedTools && !enabledSkills && !step.resources && !role.resources && !globalResources) {
    return null;
  }

  return {
    ...base,
    tools: allowedTools
      ? {
        ...(base.tools ?? {}),
        allowed: allowedTools,
      }
      : base.tools ?? null,
    skills: enabledSkills
      ? {
        ...(base.skills ?? {}),
        enabled: enabledSkills,
      }
      : base.skills ?? null,
  };
};
