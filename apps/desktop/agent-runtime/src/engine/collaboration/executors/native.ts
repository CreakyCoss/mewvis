import type {
  BridgeRuntimeResources,
} from "../../agent/contracts/protocol.js";
import { messageFromError } from "../../agent/utils/error.js";
import type {
  CollaborationAgentRole,
  CollaborationEvent,
  CollaborationExecutionState,
  CollaborationExecutor,
  CollaborationExecutorRunInput,
  CollaborationRunContext,
  CollaborationRunInput,
  CollaborationSkippedStepResult,
  CollaborationAgentInvocation,
  CollaborationStepResult,
  CollaborationTransformWorkflowStep,
  CollaborationConditionWorkflowStep,
  CollaborationDispatchWorkflowStep,
  CollaborationRouterWorkflowStep,
  CollaborationStepCondition,
  CollaborationAgentWorkflowStep,
  CollaborationWorkflowStep,
  RunAgentForCollaboration,
} from "../contracts/index.js";
import type {
  CollaborationHandlerContext,
  CollaborationRouterResult,
} from "../contracts/handler.js";
import { CollaborationEventType } from "../contracts/index.js";

export const nativeCollaborationExecutorId = "native" as const;

export const createNativeCollaborationExecutor = (): CollaborationExecutor => ({
  id: nativeCollaborationExecutorId,
  async run({
    context,
    emit,
    executorId,
    input,
    handlerRegistry,
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
        handlerRegistry,
        roleById,
        runAgent,
        state,
        step,
        workflowRunId,
      });

    if (input.workflow.executionMode === "parallel") {
      assertNoDynamicRouterSteps(steps);
      await runParallelSteps(steps, executeStep);
    } else {
      await runSerialSteps(steps, executeStep, input.workflow.maxSteps);
    }

    return collectCollaborationRunResult({
      executorId,
      state,
      steps,
      workflowRunId,
    });
  },
});

type StepExecutionOutcome = CollaborationStepResult | CollaborationSkippedStepResult;

type ExecuteStep = (step: CollaborationWorkflowStep) => Promise<StepExecutionOutcome>;

export type RunStepInput = {
  context: CollaborationRunContext;
  emit: (event: CollaborationEvent) => void;
  handlerRegistry: CollaborationExecutorRunInput["handlerRegistry"];
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
  const declaredStepIds = new Set(steps.map((step) => step.id));
  const dynamicStepResults = Array.from(state.stepResultById.values())
    .filter((step) => !declaredStepIds.has(step.stepId));
  const skippedSteps = steps.map((step) => state.skippedStepById.get(step.id))
    .filter((step): step is CollaborationSkippedStepResult => Boolean(step));

  return {
    workflowRunId,
    executorId,
    steps: [...stepResults, ...dynamicStepResults],
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
  handlerRegistry,
  input,
  roleById,
  runAgent,
  state,
  step,
  workflowRunId,
}: RunStepInput): Promise<StepExecutionOutcome> => {
  if (!await shouldRunStep({
    emit,
    handlerRegistry,
    input,
    state,
    step,
    workflowRunId,
  })) {
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

  if (step.type === "transform") {
    return runTransformStep({
      emit,
      handlerRegistry,
      input,
      state,
      step,
      workflowRunId,
    });
  }

  if (step.type === "condition") {
    return runConditionStep({
      emit,
      handlerRegistry,
      input,
      state,
      step,
      workflowRunId,
    });
  }

  if (step.type === "router") {
    return runRouterStep({
      emit,
      handlerRegistry,
      input,
      state,
      step,
      workflowRunId,
    });
  }

  if (step.type === "dispatch") {
    return runDispatchStep({
      context,
      emit,
      input,
      roleById,
      runAgent,
      state,
      step,
      workflowRunId,
    });
  }

  return runAgentStepWithRetry({
    context,
    emit,
    input,
    roleById,
    runAgent,
    state,
    step,
    workflowRunId,
  });
};

const runAgentStepWithRetry = async ({
  context,
  emit,
  input,
  roleById,
  runAgent,
  state,
  step,
  workflowRunId,
}: Omit<RunStepInput, "handlerRegistry" | "step"> & {
  step: CollaborationAgentWorkflowStep;
}): Promise<CollaborationStepResult> => {
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
      stepType: step.type,
      agentRoleId: role.id,
      agentTaskId,
    });

    try {
      const result = await runAgent(
        buildAgentCommand(input, step, role, agentTaskId, state),
        {
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
        stepType: step.type,
        agentRoleId: role.id,
        agentTaskId,
        outputKey: step.outputKey?.trim() || step.id,
        output: result.text,
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

const runDispatchStep = async ({
  context,
  emit,
  input,
  roleById,
  runAgent,
  state,
  step,
  workflowRunId,
}: Omit<RunStepInput, "handlerRegistry" | "step"> & {
  step: CollaborationDispatchWorkflowStep;
}) => {
  emit({
    type: CollaborationEventType.StepStarted,
    workflowRunId,
    stepId: step.id,
    stepType: step.type,
  });

  const invocations = normalizeDispatchInvocations(resolveDispatchInput(step.input, state));
  const runInvocation = (invocation: CollaborationAgentInvocation, index: number) =>
    runAgentStepWithRetry({
      context,
      emit,
      input,
      roleById,
      runAgent,
      state,
      step: createDispatchAgentStep(step, invocation, index),
      workflowRunId,
    });

  const invocationResults = step.mode === "parallel"
    ? await Promise.all(invocations.map((invocation, index) => runInvocation(invocation, index)))
    : [];

  if (step.mode !== "parallel") {
    for (const [index, invocation] of invocations.entries()) {
      invocationResults.push(await runInvocation(invocation, index));
    }
  }

  const output = {
    count: invocationResults.length,
    invocations: invocationResults.map((result) => ({
      stepId: result.stepId,
      agentRoleId: result.agentRoleId,
      outputKey: result.outputKey,
      text: result.text,
    })),
  };
  const stepResult = createStepResult(step, output);
  state.stepResultById.set(step.id, stepResult);
  state.output[stepResult.outputKey] = output;
  emit({
    type: CollaborationEventType.StepDone,
    workflowRunId,
    step: stepResult,
  });
  return stepResult;
};

const runTransformStep = async ({
  emit,
  handlerRegistry,
  input,
  state,
  step,
  workflowRunId,
}: {
  emit: (event: CollaborationEvent) => void;
  handlerRegistry: CollaborationExecutorRunInput["handlerRegistry"];
  input: CollaborationRunInput;
  state: CollaborationExecutionState;
  step: CollaborationTransformWorkflowStep;
  workflowRunId: string;
}) => {
  emit({
    type: CollaborationEventType.StepStarted,
    workflowRunId,
    stepId: step.id,
    stepType: step.type,
  });

  const transform = handlerRegistry.requireTransform(step.transform);
  const output = await transform(
    resolveStepInput(step.input, state),
    createHandlerContext({
      emit,
      input,
      state,
      step,
      workflowRunId,
    }),
  );
  const stepResult = createStepResult(step, output);
  state.stepResultById.set(step.id, stepResult);
  state.output[stepResult.outputKey] = output;
  emit({
    type: CollaborationEventType.StepDone,
    workflowRunId,
    step: stepResult,
  });
  return stepResult;
};

const runConditionStep = async ({
  emit,
  handlerRegistry,
  input,
  state,
  step,
  workflowRunId,
}: {
  emit: (event: CollaborationEvent) => void;
  handlerRegistry: CollaborationExecutorRunInput["handlerRegistry"];
  input: CollaborationRunInput;
  state: CollaborationExecutionState;
  step: CollaborationConditionWorkflowStep;
  workflowRunId: string;
}) => {
  emit({
    type: CollaborationEventType.StepStarted,
    workflowRunId,
    stepId: step.id,
    stepType: step.type,
  });

  const condition = handlerRegistry.requireCondition(step.condition);
  const output = await condition(
    resolveStepInput(step.input, state),
    createHandlerContext({
      emit,
      input,
      state,
      step,
      workflowRunId,
    }),
  );
  const stepResult = createStepResult(step, output);
  state.stepResultById.set(step.id, stepResult);
  state.output[stepResult.outputKey] = output;
  emit({
    type: CollaborationEventType.StepDone,
    workflowRunId,
    step: stepResult,
  });
  return stepResult;
};

const runRouterStep = async ({
  emit,
  handlerRegistry,
  input,
  state,
  step,
  workflowRunId,
}: {
  emit: (event: CollaborationEvent) => void;
  handlerRegistry: CollaborationExecutorRunInput["handlerRegistry"];
  input: CollaborationRunInput;
  state: CollaborationExecutionState;
  step: CollaborationRouterWorkflowStep;
  workflowRunId: string;
}) => {
  emit({
    type: CollaborationEventType.StepStarted,
    workflowRunId,
    stepId: step.id,
    stepType: step.type,
  });

  const router = handlerRegistry.requireRouter(step.router);
  const routeResult = await router(
    resolveStepInput(step.input, state),
    createHandlerContext({
      emit,
      input,
      state,
      step,
      workflowRunId,
    }),
  );
  const normalizedRoute = normalizeRouterResult(routeResult, step.fallbackRoute);
  const stepResult = createStepResult(step, normalizedRoute.output, {
    route: normalizedRoute.route,
  });
  state.stepResultById.set(step.id, stepResult);
  state.output[stepResult.outputKey] = stepResult.output;
  emit({
    type: CollaborationEventType.StepDone,
    workflowRunId,
    step: stepResult,
  });
  return stepResult;
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

const runSerialSteps = async (
  steps: readonly CollaborationWorkflowStep[],
  executeStep: ExecuteStep,
  maxSteps: number | null | undefined,
) => {
  const stepIndexById = new Map(steps.map((step, index) => [step.id, index]));
  let index = 0;
  let executedCount = 0;
  const maxExecutedSteps = normalizeWorkflowMaxSteps(maxSteps, steps.length);

  while (index < steps.length) {
    if (executedCount >= maxExecutedSteps) {
      throw new Error(`协作 workflow 超过最大串行路由步数：${maxExecutedSteps}`);
    }
    executedCount += 1;

    const step = steps[index];
    const outcome = await executeStep(step);
    const nextStepId = resolveRouterNextStepId(step, outcome);
    if (!nextStepId) {
      index += 1;
      continue;
    }
    if (nextStepId === "__end__") {
      break;
    }

    const nextIndex = stepIndexById.get(nextStepId);
    if (nextIndex === undefined) {
      throw new Error(`协作 router 指向不存在的 step：${step.id} -> ${nextStepId}`);
    }
    index = nextIndex;
  }
};

export const normalizeWorkflowMaxSteps = (
  value: number | null | undefined,
  stepCount: number,
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return Math.max(32, stepCount * 4);
  }
  return Math.max(1, Math.floor(value));
};

const resolveRouterNextStepId = (
  step: CollaborationWorkflowStep,
  outcome: StepExecutionOutcome,
) => {
  if (step.type !== "router" || !step.routes || !("outputKey" in outcome)) {
    return null;
  }

  const route = outcome.route ?? null;
  const destination = route ? step.routes[route] : undefined;
  const fallbackDestination = step.fallbackRoute
    ? step.routes[step.fallbackRoute] ?? step.fallbackRoute
    : null;
  if (!route && !fallbackDestination) {
    return null;
  }

  return normalizeRouterDestination(destination ?? fallbackDestination);
};

const normalizeRouterDestination = (value: string | null | undefined) => {
  const destination = value?.trim();
  if (!destination) {
    return null;
  }
  return destination === "end" || destination === "__end__" ? "__end__" : destination;
};

const assertNoDynamicRouterSteps = (steps: readonly CollaborationWorkflowStep[]) => {
  const dynamicRouter = steps.find((step) =>
    step.type === "router" && step.routes && Object.keys(step.routes).length > 0
  );
  if (dynamicRouter) {
    throw new Error(`parallel workflow 暂不支持 router.routes：${dynamicRouter.id}`);
  }
};

const createAgentTaskId = (workflowRunId: string, stepId: string, attempt = 1) =>
  attempt === 1
    ? `${workflowRunId}:${stepId}`
    : `${workflowRunId}:${stepId}:attempt-${attempt}`;

const normalizeDispatchInvocations = (
  input: unknown,
): CollaborationAgentInvocation[] => {
  const rawInvocations = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { invocations?: unknown }).invocations)
    ? (input as { invocations: unknown[] }).invocations
    : [];

  return rawInvocations.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`dispatch invocation #${index + 1} 必须是对象`);
    }
    const invocation = item as Partial<CollaborationAgentInvocation>;
    if (typeof invocation.agentRoleId !== "string" || !invocation.agentRoleId.trim()) {
      throw new Error(`dispatch invocation #${index + 1} 缺少 agentRoleId`);
    }
    if (typeof invocation.userMessage !== "string") {
      throw new Error(`dispatch invocation #${index + 1} 缺少 userMessage`);
    }
    return {
      ...invocation,
      agentRoleId: invocation.agentRoleId.trim(),
      id: typeof invocation.id === "string" ? invocation.id.trim() : invocation.id ?? null,
      label: typeof invocation.label === "string" ? invocation.label.trim() : invocation.label ?? null,
      outputKey: typeof invocation.outputKey === "string"
        ? invocation.outputKey.trim()
        : invocation.outputKey ?? null,
      userMessage: invocation.userMessage,
    };
  });
};

const createDispatchAgentStep = (
  dispatchStep: CollaborationDispatchWorkflowStep,
  invocation: CollaborationAgentInvocation,
  index: number,
): CollaborationAgentWorkflowStep => {
  const invocationId = normalizeDispatchInvocationId(invocation, index);
  return {
    id: `${dispatchStep.id}:${invocationId}`,
    type: "agent",
    agentRoleId: invocation.agentRoleId,
    label: invocation.label,
    outputKey: invocation.outputKey?.trim() || `${dispatchStep.outputKey?.trim() || dispatchStep.id}:${invocationId}`,
    userMessage: invocation.userMessage,
    systemPrompt: invocation.systemPrompt,
    requestContext: invocation.requestContext,
    runtimeInstruction: invocation.runtimeInstruction,
    bootstrapInstruction: invocation.bootstrapInstruction,
    runtimeModel: invocation.runtimeModel,
    allowedTools: invocation.allowedTools,
    enabledSkills: invocation.enabledSkills,
    resources: invocation.resources,
    maxRetries: invocation.maxRetries,
    metadata: {
      ...(dispatchStep.metadata ?? {}),
      ...(invocation.metadata ?? {}),
      dispatchStepId: dispatchStep.id,
      invocationId,
    },
  };
};

const normalizeDispatchInvocationId = (
  invocation: CollaborationAgentInvocation,
  index: number,
) => {
  const rawId = invocation.id?.trim() ||
    invocation.outputKey?.trim() ||
    invocation.agentRoleId.trim() ||
    `item-${index + 1}`;
  return rawId.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "") ||
    `item-${index + 1}`;
};

const normalizeMaxRetries = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

const shouldRunStep = async ({
  emit,
  handlerRegistry,
  input,
  state,
  step,
  workflowRunId,
}: {
  emit: (event: CollaborationEvent) => void;
  handlerRegistry: CollaborationExecutorRunInput["handlerRegistry"];
  input: CollaborationRunInput;
  state: CollaborationExecutionState;
  step: CollaborationWorkflowStep;
  workflowRunId: string;
}) => {
  if (!step.when) {
    return true;
  }
  return evaluateCondition({
    condition: step.when,
    emit,
    handlerRegistry,
    input,
    state,
    step,
    workflowRunId,
  });
};

const evaluateCondition = async ({
  condition,
  emit,
  handlerRegistry,
  input,
  state,
  step,
  workflowRunId,
}: {
  condition: CollaborationStepCondition;
  emit: (event: CollaborationEvent) => void;
  handlerRegistry: CollaborationExecutorRunInput["handlerRegistry"];
  input: CollaborationRunInput;
  state: CollaborationExecutionState;
  step: CollaborationWorkflowStep;
  workflowRunId: string;
}) => {
  if ("condition" in condition) {
    const handler = handlerRegistry.requireCondition(condition.condition);
    const matched = await handler(
      resolveStepInput(condition.input, state),
      createHandlerContext({
        emit,
        input,
        state,
        step,
        workflowRunId,
      }),
    );
    return condition.invert ? !matched : matched;
  }

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

const createStepResult = (
  step: CollaborationWorkflowStep,
  output: unknown,
  extra: Pick<CollaborationStepResult, "route"> = {},
): CollaborationStepResult => ({
  stepId: step.id,
  stepType: step.type,
  outputKey: step.outputKey?.trim() || step.id,
  output,
  text: stringifyTemplateValue(output),
  ...extra,
});

const createHandlerContext = <TStep extends CollaborationWorkflowStep>({
  emit,
  input,
  state,
  step,
  workflowRunId,
}: {
  emit: (event: CollaborationEvent) => void;
  input: CollaborationRunInput;
  state: CollaborationExecutionState;
  step: TStep;
  workflowRunId: string;
}): CollaborationHandlerContext<TStep> => ({
  emit,
  input,
  state,
  step,
  workflowRunId,
});

const normalizeRouterResult = (
  result: CollaborationRouterResult,
  fallbackRoute: string | null | undefined,
) => {
  if (typeof result === "string" || result === null) {
    const route = result ?? fallbackRoute ?? null;
    return {
      route,
      output: {
        route,
      },
    };
  }

  const route = result.route ?? fallbackRoute ?? null;
  return {
    route,
    output: result.output ?? {
      route,
    },
  };
};

const buildAgentCommand = (
  input: CollaborationRunInput,
  step: CollaborationAgentWorkflowStep,
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

const resolveStepInput = (
  value: unknown,
  state: CollaborationExecutionState,
): unknown => {
  if (typeof value === "string") {
    return renderTemplate(value, state);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveStepInput(item, state));
  }
  if (isTemplateRef(value)) {
    return resolveTemplateValue(value.$ref, state);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveStepInput(item, state),
      ]),
    );
  }
  return value;
};

const resolveDispatchInput = (
  value: unknown,
  state: CollaborationExecutionState,
): unknown => {
  if (isTemplateRef(value)) {
    return resolveTemplateValue(value.$ref, state);
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isTemplateRef(record.invocations)) {
      return {
        ...record,
        invocations: resolveTemplateValue(record.invocations.$ref, state),
      };
    }
  }
  return value;
};

const isTemplateRef = (value: unknown): value is { $ref: string } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length === 1 && entries[0]?.[0] === "$ref" &&
    typeof entries[0]?.[1] === "string";
};

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
  if (root === "outputs") {
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
  step: CollaborationAgentWorkflowStep,
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
