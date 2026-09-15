import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { CollaborationRuntime, CollaborationRuntimeRunInput } from "../types.js";
import type { CollaborationSkippedStep, CollaborationStepResult } from "../../../../../protocol/wire.js";
import type {
  CollaborationRunInput,
  CollaborationRouterWorkflowStep,
  CollaborationWorkflowStep,
} from "../../../../../protocol/index.js";
import {
  collectCollaborationRunResult,
  createCollaborationExecutionState,
  normalizeWorkflowMaxSteps,
  runStepWithRetry,
} from "../shared/step-runner.js";

export const langGraphCollaborationRuntimeId = "langgraph" as const;

type LangGraphWorkflowState = {
  input: unknown;
  output: Record<string, unknown>;
  stepResults: CollaborationStepResult[];
  skippedSteps: CollaborationSkippedStep[];
};

type LangGraphWorkflowUpdate = Partial<LangGraphWorkflowState>;

function mergeStepResults(left: CollaborationStepResult[], right: CollaborationStepResult[]) {
  return mergeByStepId(left, right);
}

function mergeSkippedSteps(left: CollaborationSkippedStep[], right: CollaborationSkippedStep[]) {
  return mergeByStepId(left, right);
}

const WorkflowStateAnnotation = Annotation.Root({
  input: Annotation<unknown>(),
  output: Annotation<Record<string, unknown>, Record<string, unknown>>({
    reducer: (left, right) => ({
      ...(left ?? {}),
      ...(right ?? {}),
    }),
    default: () => ({}),
  }),
  stepResults: Annotation<CollaborationStepResult[], CollaborationStepResult[]>({
    reducer: mergeStepResults,
    default: () => [],
  }),
  skippedSteps: Annotation<CollaborationSkippedStep[], CollaborationSkippedStep[]>({
    reducer: mergeSkippedSteps,
    default: () => [],
  }),
});

type LangGraphWorkflowBuilder = StateGraph<
  typeof WorkflowStateAnnotation.spec,
  LangGraphWorkflowState,
  LangGraphWorkflowUpdate,
  string
>;

export const createLangGraphCollaborationRuntime = (): CollaborationRuntime => ({
  id: langGraphCollaborationRuntimeId,
  async run({ context, emit, handlerRegistry, input, runAgent, workflowRunId }: CollaborationRuntimeRunInput) {
    const steps = input.workflow.steps ?? [];
    const roleById = new Map(input.agents.map((role) => [role.id, role]));
    let graph = new StateGraph(WorkflowStateAnnotation) as LangGraphWorkflowBuilder;

    for (const step of steps) {
      graph = graph.addNode(step.id, async (state: LangGraphWorkflowState) => {
        const executionState = createCollaborationExecutionState(state.input, {
          output: state.output,
          skippedSteps: state.skippedSteps,
          stepResults: state.stepResults,
        });
        const outcome = await runStepWithRetry({
          context,
          emit,
          handlerRegistry,
          input,
          roleById,
          runAgent,
          state: executionState,
          step,
          workflowRunId,
        });

        if ("outputKey" in outcome) {
          return {
            output: executionState.output,
            stepResults: Array.from(executionState.stepResultById.values()),
            skippedSteps: Array.from(executionState.skippedStepById.values()),
          };
        }

        return {
          output: executionState.output,
          stepResults: Array.from(executionState.stepResultById.values()),
          skippedSteps: Array.from(executionState.skippedStepById.values()),
        };
      });
    }

    graph = addWorkflowEdges(graph, input, steps);

    const compiledGraph = graph.compile({
      name: input.workflow.id,
    });
    const finalState = await compiledGraph.invoke(
      {
        input: input.input,
        output: {},
        stepResults: [],
        skippedSteps: [],
      },
      {
        recursionLimit: normalizeWorkflowMaxSteps(input.workflow.maxSteps, steps.length),
      },
    );
    const executionState = createCollaborationExecutionState(finalState.input, {
      output: finalState.output,
      skippedSteps: finalState.skippedSteps,
      stepResults: finalState.stepResults,
    });

    return collectCollaborationRunResult({
      state: executionState,
      steps,
      workflowRunId,
    });
  },
});

const addWorkflowEdges = (
  graph: LangGraphWorkflowBuilder,
  input: CollaborationRunInput,
  steps: readonly CollaborationWorkflowStep[],
) => {
  if (input.workflow.executionMode !== "parallel") {
    return addSerialEdges(graph, steps);
  }

  return addParallelEdges(graph, steps);
};

const addSerialEdges = (graph: LangGraphWorkflowBuilder, steps: readonly CollaborationWorkflowStep[]) => {
  let nextGraph = graph.addEdge(START, steps[0].id);
  for (let index = 0; index < steps.length - 1; index += 1) {
    const step = steps[index];
    if (step.type === "router" && step.routes && Object.keys(step.routes).length > 0) {
      nextGraph = nextGraph.addConditionalEdges(
        step.id,
        (state: LangGraphWorkflowState) => resolveRouterRoute(state, step),
        createRouterPathMap(step, steps[index + 1]?.id ?? null, steps),
      );
      continue;
    }
    nextGraph = nextGraph.addEdge(step.id, steps[index + 1].id);
  }
  const lastStep = steps[steps.length - 1];
  if (lastStep.type === "router" && lastStep.routes && Object.keys(lastStep.routes).length > 0) {
    return nextGraph.addConditionalEdges(
      lastStep.id,
      (state: LangGraphWorkflowState) => resolveRouterRoute(state, lastStep),
      createRouterPathMap(lastStep, null, steps),
    );
  }
  return nextGraph.addEdge(lastStep.id, END);
};

const addParallelEdges = (graph: LangGraphWorkflowBuilder, steps: readonly CollaborationWorkflowStep[]) => {
  const dynamicRouter = steps.find(
    (step) => step.type === "router" && step.routes && Object.keys(step.routes).length > 0,
  );
  if (dynamicRouter) {
    throw new Error(`parallel workflow 暂不支持 router.routes：${dynamicRouter.id}`);
  }

  const outgoingStepIds = new Set<string>();
  let nextGraph = graph;

  for (const step of steps) {
    const dependencyIds = step.dependsOn ?? [];
    if (dependencyIds.length === 0) {
      nextGraph = nextGraph.addEdge(START, step.id);
      continue;
    }

    for (const dependencyId of dependencyIds) {
      outgoingStepIds.add(dependencyId);
    }

    nextGraph =
      dependencyIds.length === 1
        ? nextGraph.addEdge(dependencyIds[0], step.id)
        : nextGraph.addEdge(dependencyIds, step.id);
  }

  const terminalSteps = steps.filter((step) => !outgoingStepIds.has(step.id));
  if (terminalSteps.length === 0) {
    throw new Error("协作 workflow 存在循环依赖或无法满足的 dependsOn");
  }

  for (const step of terminalSteps) {
    nextGraph = nextGraph.addEdge(step.id, END);
  }

  return nextGraph;
};

const resolveRouterRoute = (state: LangGraphWorkflowState, step: CollaborationRouterWorkflowStep) => {
  const route = state.stepResults.find((result) => result.stepId === step.id)?.route ?? null;
  if (route && step.routes?.[route]) {
    return route;
  }
  if (route === "end" || route === "__end__") {
    return "__end__";
  }
  if (step.fallbackRoute && step.routes?.[step.fallbackRoute]) {
    return step.fallbackRoute;
  }
  if (step.fallbackRoute === "end" || step.fallbackRoute === "__end__") {
    return "__end__";
  }
  if (!route) {
    return "__next__";
  }

  throw new Error(`协作 router 返回了未注册 route：${step.id}/${route}`);
};

const createRouterPathMap = (
  step: CollaborationRouterWorkflowStep,
  nextStepId: string | null,
  steps: readonly CollaborationWorkflowStep[],
) => {
  const stepIds = new Set(steps.map((item) => item.id));
  const pathMap: Record<string, string> = {
    __end__: END,
    end: END,
    __next__: nextStepId ?? END,
  };

  for (const [route, destination] of Object.entries(step.routes ?? {})) {
    const normalizedDestination = normalizeRouterDestination(destination);
    if (normalizedDestination === END) {
      pathMap[route] = END;
      continue;
    }
    if (!stepIds.has(normalizedDestination)) {
      throw new Error(`协作 router 指向不存在的 step：${step.id}/${route} -> ${destination}`);
    }
    pathMap[route] = normalizedDestination;
  }

  return pathMap;
};

const normalizeRouterDestination = (value: string) => {
  const destination = value.trim();
  return destination === "end" || destination === "__end__" ? END : destination;
};

const mergeByStepId = <T extends { stepId: string }>(left: T[] = [], right: T[] = []) => {
  const byStepId = new Map(left.map((step) => [step.stepId, step]));
  for (const step of right) {
    byStepId.set(step.stepId, step);
  }
  return Array.from(byStepId.values());
};
