import type { CollaborationWorkflowStep } from "../../../../protocol/index.js";

export const validateWorkflowSteps = (workflowId: string, steps: readonly CollaborationWorkflowStep[]) => {
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

const validateWorkflowStepShape = (workflowId: string, step: CollaborationWorkflowStep) => {
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
