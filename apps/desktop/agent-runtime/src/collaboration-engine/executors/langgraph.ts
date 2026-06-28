import {
  Annotation,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type {
  CollaborationExecutor,
  CollaborationExecutorRunInput,
  CollaborationRunInput,
  CollaborationSkippedStepResult,
  CollaborationStepResult,
  CollaborationWorkflowStep,
} from "../contracts.js";
import {
  collectCollaborationRunResult,
  createCollaborationExecutionState,
  runStepWithRetry,
} from "./native.js";

export const langGraphCollaborationExecutorId = "langgraph" as const;

type LangGraphWorkflowState = {
  input: unknown;
  output: Record<string, unknown>;
  stepResults: CollaborationStepResult[];
  skippedSteps: CollaborationSkippedStepResult[];
};

type LangGraphWorkflowUpdate = Partial<LangGraphWorkflowState>;

function mergeStepResults(
  left: CollaborationStepResult[],
  right: CollaborationStepResult[],
) {
  return mergeByStepId(left, right);
}

function mergeSkippedSteps(
  left: CollaborationSkippedStepResult[],
  right: CollaborationSkippedStepResult[],
) {
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
  skippedSteps: Annotation<CollaborationSkippedStepResult[], CollaborationSkippedStepResult[]>({
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

export const createLangGraphCollaborationExecutor = (): CollaborationExecutor => ({
  id: langGraphCollaborationExecutorId,
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
          input,
          roleById,
          runAgent,
          state: executionState,
          step,
          workflowRunId,
        });

        if ("text" in outcome) {
          return {
            output: {
              [outcome.outputKey]: outcome.text,
            },
            stepResults: [outcome],
          };
        }

        return {
          skippedSteps: [outcome],
        };
      });
    }

    graph = addWorkflowEdges(graph, input, steps);

    const compiledGraph = graph.compile({
      name: input.workflow.id,
    });
    const finalState = await compiledGraph.invoke({
      input: input.input,
      output: {},
      stepResults: [],
      skippedSteps: [],
    });
    const executionState = createCollaborationExecutionState(finalState.input, {
      output: finalState.output,
      skippedSteps: finalState.skippedSteps,
      stepResults: finalState.stepResults,
    });

    return collectCollaborationRunResult({
      executorId,
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

const addSerialEdges = (
  graph: LangGraphWorkflowBuilder,
  steps: readonly CollaborationWorkflowStep[],
) => {
  let nextGraph = graph.addEdge(START, steps[0].id);
  for (let index = 0; index < steps.length - 1; index += 1) {
    nextGraph = nextGraph.addEdge(steps[index].id, steps[index + 1].id);
  }
  return nextGraph.addEdge(steps[steps.length - 1].id, END);
};

const addParallelEdges = (
  graph: LangGraphWorkflowBuilder,
  steps: readonly CollaborationWorkflowStep[],
) => {
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

    nextGraph = dependencyIds.length === 1
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

const mergeByStepId = <
  T extends { stepId: string },
>(
  left: T[] = [],
  right: T[] = [],
) => {
  const byStepId = new Map(left.map((step) => [step.stepId, step]));
  for (const step of right) {
    byStepId.set(step.stepId, step);
  }
  return Array.from(byStepId.values());
};
