import type { AgentClientCollaborationEvent } from "@/agent-client/types";
import type { TavernRoomStoreState } from "@/features/pages/taverns/room/context";
import type { ExecutionStep } from "../../execution-trace";

type CollaborationTraceOptions = {
  scopeLabel?: string;
  agentRoleLabelById?: Record<string, string | undefined>;
};

const workflowTraceStepId = (workflowRunId: string) => `workflow:${workflowRunId}`;

const agentTraceStepId = (workflowRunId: string, stepId: string) => `workflow:${workflowRunId}:step:${stepId}`;

const shortId = (value: string | null | undefined) => value?.slice(0, 8) ?? "runtime";

const toDetailText = (value: unknown, fallback = "") => {
  if (typeof value === "string") {
    return value.trim().slice(0, 160);
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  try {
    return JSON.stringify(value).slice(0, 160);
  } catch {
    return fallback;
  }
};

const getRoleLabel = (
  agentRoleId: string | null | undefined,
  options: CollaborationTraceOptions,
  fallback = "协作步骤",
) => (agentRoleId ? (options.agentRoleLabelById?.[agentRoleId] ?? agentRoleId) : fallback);

const getStepLabel = (
  stepId: string,
  stepType: string | undefined,
  agentRoleId: string | null | undefined,
  options: CollaborationTraceOptions,
) => getRoleLabel(agentRoleId, options, stepType ? `${stepType} · ${stepId}` : stepId);

const getWorkflowLabel = (workflowId: string, options: CollaborationTraceOptions) => {
  const scopeLabel = options.scopeLabel?.trim();
  return scopeLabel ? `${scopeLabel} 协作` : `协作 ${workflowId}`;
};

const upsertTraceStep = (ctx: TavernRoomStoreState, step: ExecutionStep) => {
  ctx.upsertExecutionStep?.(step);
};

const patchAgentEventDetail = (
  ctx: TavernRoomStoreState,
  event: Extract<AgentClientCollaborationEvent, { type: "agent_event" }>,
) => {
  const nestedEvent = event.event;
  const stepId = agentTraceStepId(event.workflowRunId, event.stepId);

  if (nestedEvent.type === "text_delta") {
    ctx.patchExecutionStep?.(stepId, {
      detail: "正在输出文本...",
    });
    return;
  }

  if (nestedEvent.type === "thinking_delta") {
    ctx.patchExecutionStep?.(stepId, {
      detail: "正在推理...",
    });
    return;
  }

  if (nestedEvent.type === "tool_start") {
    ctx.patchExecutionStep?.(stepId, {
      detail: `调用工具 ${toDetailText(nestedEvent.toolName, "unknown")}`,
    });
    return;
  }

  if (nestedEvent.type === "tool_end") {
    ctx.patchExecutionStep?.(stepId, {
      detail: `工具完成 ${toDetailText(nestedEvent.toolName, "unknown")}`,
    });
    return;
  }

  if (nestedEvent.type === "done") {
    ctx.patchExecutionStep?.(stepId, {
      detail: toDetailText(nestedEvent.text, "Agent 已完成。"),
    });
  }
};

export const applyTavernCollaborationTraceEvent = (
  ctx: TavernRoomStoreState,
  event: AgentClientCollaborationEvent,
  options: CollaborationTraceOptions = {},
) => {
  if (event.type === "workflow_started") {
    upsertTraceStep(ctx, {
      id: workflowTraceStepId(event.workflowRunId),
      label: getWorkflowLabel(event.workflowId, options),
      detail: `run ${shortId(event.workflowRunId)}`,
      status: "running",
    });
    return;
  }

  if (event.type === "step_started") {
    upsertTraceStep(ctx, {
      id: agentTraceStepId(event.workflowRunId, event.stepId),
      label: getStepLabel(event.stepId, event.stepType, event.agentRoleId, options),
      detail: `${event.stepId} · task ${shortId(event.agentTaskId)}`,
      status: "running",
    });
    return;
  }

  if (event.type === "agent_event") {
    patchAgentEventDetail(ctx, event);
    return;
  }

  if (event.type === "step_done") {
    ctx.patchExecutionStep?.(agentTraceStepId(event.workflowRunId, event.step.stepId), {
      detail: `${event.step.outputKey} · ${event.step.text.slice(0, 120)}`,
      status: "done",
    });
    return;
  }

  if (event.type === "step_skipped") {
    upsertTraceStep(ctx, {
      id: agentTraceStepId(event.workflowRunId, event.step.stepId),
      label: event.step.stepId,
      detail: event.step.reason,
      status: "skipped",
    });
    return;
  }

  if (event.type === "workflow_done") {
    ctx.patchExecutionStep?.(workflowTraceStepId(event.workflowRunId), {
      detail: `${event.result.steps.length} 步完成，${event.result.skippedSteps?.length ?? 0} 步跳过`,
      status: "done",
    });
    return;
  }

  if (event.type === "collaboration_result") {
    ctx.patchExecutionStep?.(workflowTraceStepId(event.workflowRunId), {
      detail: `${event.steps.length} 步完成，${event.skippedSteps?.length ?? 0} 步跳过`,
      status: "done",
    });
  }
};
