import type {
  CollaborationWorkflowStep,
} from "../../../../../protocol/index.js";
import type {
  CollaborationRuntime,
  CollaborationRuntimeRunInput,
} from "../types.js";
import {
  assertNoDynamicRouterSteps,
  collectCollaborationRunResult,
  createCollaborationExecutionState,
  runParallelSteps,
  runSerialSteps,
  runStepWithRetry,
} from "../shared/step-runner.js";

export {
  CollaborationStepRunError,
} from "../shared/step-runner.js";

export const nativeCollaborationRuntimeId = "native" as const;

export const createNativeCollaborationRuntime = (): CollaborationRuntime => ({
  id: nativeCollaborationRuntimeId,
  async run({
    context,
    emit,
    runtimeId,
    input,
    handlerRegistry,
    runAgent,
    workflowRunId,
  }: CollaborationRuntimeRunInput) {
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
      runtimeId,
      state,
      steps,
      workflowRunId,
    });
  },
});
