import type { AgentClientCollaborationEvent } from "@/agent-client/types";
import type { TavernPageContextValue } from "../../../context";
import type { ExecutionStep } from "../../execution-trace";
import type {
  TavernWorkflowTraceEvent,
  TavernWorkflowTraceResult,
  TavernWorkflowTraceRun,
  TavernWorkflowTraceStep,
} from "../../../../types";

type CollaborationTraceOptions = {
  scopeLabel?: string;
  agentRoleLabelById?: Record<string, string | undefined>;
};

const TRACE_RUN_LIMIT = 20;
const TRACE_EVENT_LIMIT = 200;

const workflowTraceStepId = (workflowRunId: string) => `workflow:${workflowRunId}`;

const agentTraceStepId = (workflowRunId: string, stepId: string) => `workflow:${workflowRunId}:step:${stepId}`;

const shortId = (value: string | null | undefined) => value?.slice(0, 8) ?? "runtime";

const activeTraceSceneInstanceId = (ctx: TavernPageContextValue) =>
  ctx.activeRoom?.activeSceneInstanceId ??
  ctx.activeRoom?.activeSceneId ??
  ctx.activeRoom?.sceneInstances[0]?.id ??
  ctx.activeRoom?.id ??
  "";

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

const previewValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return depth >= 2 ? `[${value.length} items]` : value.slice(0, 20).map((item) => previewValue(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) {
      return "[object]";
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, item]) => [key, previewValue(item, depth + 1)]),
    );
  }
  return String(value);
};

const shouldPersistTraceEvent = (event: AgentClientCollaborationEvent) =>
  event.type !== "agent_event" || (event.event.type !== "text_delta" && event.event.type !== "thinking_delta");

const collaborationEventDetail = (event: AgentClientCollaborationEvent) => {
  if (event.type === "workflow_started") {
    return event.workflowId;
  }
  if (event.type === "step_started") {
    return `${event.stepId} · ${event.agentRoleId ?? event.stepType}`;
  }
  if (event.type === "agent_event") {
    return event.event.type;
  }
  if (event.type === "step_done") {
    return `${event.step.outputKey} · ${event.step.text.slice(0, 120)}`;
  }
  if (event.type === "step_skipped") {
    return `${event.step.stepId} · ${event.step.reason}`;
  }
  if (event.type === "workflow_done") {
    return `${event.result.steps.length} steps`;
  }
  return `${event.steps.length} steps`;
};

const traceEventFromCollaborationEvent = (
  event: AgentClientCollaborationEvent,
  index: number,
): TavernWorkflowTraceEvent | null => {
  if (!shouldPersistTraceEvent(event)) {
    return null;
  }

  const base = {
    id: `${event.workflowRunId}:${index}`,
    at: Date.now(),
    type: event.type,
    workflowRunId: event.workflowRunId,
    detail: collaborationEventDetail(event),
  };

  if (event.type === "workflow_started") {
    return {
      ...base,
      workflowId: event.workflowId,
      payload: {
        workflowId: event.workflowId,
      },
    };
  }

  if (event.type === "step_started" || event.type === "agent_event") {
    return {
      ...base,
      stepId: event.stepId,
      stepType: event.type === "step_started" ? event.stepType : "agent",
      agentRoleId: event.agentRoleId,
      agentTaskId: event.agentTaskId,
      payload:
        event.type === "agent_event"
          ? {
              nestedType: event.event.type,
              nested: previewValue(event.event),
            }
          : undefined,
    };
  }

  if (event.type === "step_done") {
    return {
      ...base,
      stepId: event.step.stepId,
      stepType: event.step.stepType,
      agentRoleId: event.step.agentRoleId,
      agentTaskId: event.step.agentTaskId,
      payload: {
        outputKey: event.step.outputKey,
        output: previewValue(event.step.output),
        route: event.step.route,
        textPreview: event.step.text.slice(0, 500),
      },
    };
  }

  if (event.type === "step_skipped") {
    return {
      ...base,
      stepId: event.step.stepId,
      payload: {
        reason: event.step.reason,
        condition: previewValue(event.step.condition),
      },
    };
  }

  if (event.type === "workflow_done") {
    return {
      ...base,
      payload: traceResultFromCollaborationResult(event.result.steps, event.result.skippedSteps, event.result.output),
    };
  }

  return {
    ...base,
    payload: traceResultFromCollaborationResult(event.steps, event.skippedSteps, event.output),
  };
};

const traceResultFromCollaborationResult = (
  steps: Extract<AgentClientCollaborationEvent, { type: "collaboration_result" }>["steps"],
  skippedSteps: Extract<AgentClientCollaborationEvent, { type: "collaboration_result" }>["skippedSteps"],
  output: unknown,
): TavernWorkflowTraceResult => ({
  steps: steps.map((step) => ({
    stepId: step.stepId,
    stepType: step.stepType,
    agentRoleId: step.agentRoleId,
    agentTaskId: step.agentTaskId,
    outputKey: step.outputKey,
    textPreview: step.text.slice(0, 500),
    route: step.route,
  })),
  skippedSteps: skippedSteps?.map((step) => ({
    stepId: step.stepId,
    reason: step.reason,
  })),
  output: previewValue(output),
});

const upsertTraceRunStep = (steps: TavernWorkflowTraceStep[], step: TavernWorkflowTraceStep) => {
  if (!steps.some((item) => item.id === step.id)) {
    return [...steps, step];
  }
  return steps.map((item) => (item.id === step.id ? { ...item, ...step } : item));
};

const applyEventToTraceRun = (
  run: TavernWorkflowTraceRun,
  event: AgentClientCollaborationEvent,
  options: CollaborationTraceOptions,
): TavernWorkflowTraceRun => {
  if (event.type === "step_started") {
    return {
      ...run,
      steps: upsertTraceRunStep(run.steps, {
        id: event.stepId,
        label: getStepLabel(event.stepId, event.stepType, event.agentRoleId, options),
        status: "running",
        detail: `${event.stepId} · task ${shortId(event.agentTaskId)}`,
        stepType: event.stepType,
        agentRoleId: event.agentRoleId,
        agentTaskId: event.agentTaskId,
      }),
    };
  }

  if (event.type === "agent_event") {
    const detail =
      event.event.type === "done"
        ? toDetailText(event.event.text, "Agent 已完成。")
        : event.event.type === "tool_start" || event.event.type === "tool_end"
          ? `${event.event.type} ${toDetailText(event.event.toolName, "")}`.trim()
          : "";

    if (!detail) {
      return run;
    }

    return {
      ...run,
      steps: run.steps.map((step) =>
        step.id === event.stepId
          ? {
              ...step,
              detail,
            }
          : step,
      ),
    };
  }

  if (event.type === "step_done") {
    return {
      ...run,
      steps: upsertTraceRunStep(run.steps, {
        id: event.step.stepId,
        label:
          run.steps.find((step) => step.id === event.step.stepId)?.label ??
          getStepLabel(event.step.stepId, event.step.stepType, event.step.agentRoleId, options),
        status: "done",
        detail: `${event.step.outputKey} · ${event.step.text.slice(0, 120)}`,
        stepType: event.step.stepType,
        agentRoleId: event.step.agentRoleId,
        agentTaskId: event.step.agentTaskId,
        outputKey: event.step.outputKey,
        route: event.step.route,
      }),
    };
  }

  if (event.type === "step_skipped") {
    return {
      ...run,
      steps: upsertTraceRunStep(run.steps, {
        id: event.step.stepId,
        label: run.steps.find((step) => step.id === event.step.stepId)?.label ?? event.step.stepId,
        status: "skipped",
        detail: event.step.reason,
      }),
    };
  }

  if (event.type === "workflow_done") {
    return {
      ...run,
      status: "done",
      result: traceResultFromCollaborationResult(event.result.steps, event.result.skippedSteps, event.result.output),
    };
  }

  if (event.type === "collaboration_result") {
    return {
      ...run,
      status: "done",
      result: traceResultFromCollaborationResult(event.steps, event.skippedSteps, event.output),
    };
  }

  return run;
};

const persistCollaborationTraceEvent = (
  ctx: TavernPageContextValue,
  event: AgentClientCollaborationEvent,
  options: CollaborationTraceOptions,
) => {
  if (!shouldPersistTraceEvent(event)) {
    return;
  }

  const sceneInstanceId = activeTraceSceneInstanceId(ctx);
  if (!sceneInstanceId) {
    return;
  }

  ctx.setState((current) => {
    const now = Date.now();
    const traces = current.workflowTracesByInstance[sceneInstanceId] ?? [];
    const existingIndex = traces.findIndex((trace) => trace.workflowRunId === event.workflowRunId);
    const existingRun = existingIndex >= 0 ? traces[existingIndex] : null;
    const workflowId = event.type === "workflow_started" ? event.workflowId : (existingRun?.workflowId ?? "unknown");
    const baseRun: TavernWorkflowTraceRun = existingRun ?? {
      id: event.workflowRunId,
      workflowRunId: event.workflowRunId,
      workflowId,
      taskId: "taskId" in event ? event.taskId : undefined,
      anchorMessageId: ctx.executionTraceAnchorMessageId || undefined,
      scopeLabel: options.scopeLabel,
      status: "running",
      startedAt: now,
      updatedAt: now,
      steps: [],
      events: [],
    };
    const traceEvent = traceEventFromCollaborationEvent(event, baseRun.events.length + 1);
    const nextRun = applyEventToTraceRun(
      {
        ...baseRun,
        workflowId,
        taskId: baseRun.taskId ?? ("taskId" in event ? event.taskId : undefined),
        scopeLabel: baseRun.scopeLabel ?? options.scopeLabel,
        updatedAt: now,
        events: traceEvent ? [...baseRun.events, traceEvent].slice(-TRACE_EVENT_LIMIT) : baseRun.events,
      },
      event,
      options,
    );
    const nextTraces =
      existingIndex >= 0
        ? traces.map((trace, index) => (index === existingIndex ? nextRun : trace))
        : [...traces, nextRun];

    return {
      ...current,
      workflowTracesByInstance: {
        ...current.workflowTracesByInstance,
        [sceneInstanceId]: nextTraces.sort((left, right) => left.startedAt - right.startedAt).slice(-TRACE_RUN_LIMIT),
      },
    };
  });
};

const upsertTraceStep = (ctx: TavernPageContextValue, step: ExecutionStep) => {
  ctx.upsertExecutionStep(step);
};

const patchAgentEventDetail = (
  ctx: TavernPageContextValue,
  event: Extract<AgentClientCollaborationEvent, { type: "agent_event" }>,
) => {
  const nestedEvent = event.event;
  const stepId = agentTraceStepId(event.workflowRunId, event.stepId);

  if (nestedEvent.type === "text_delta") {
    ctx.patchExecutionStep(stepId, {
      detail: "正在输出文本...",
    });
    return;
  }

  if (nestedEvent.type === "thinking_delta") {
    ctx.patchExecutionStep(stepId, {
      detail: "正在推理...",
    });
    return;
  }

  if (nestedEvent.type === "tool_start") {
    ctx.patchExecutionStep(stepId, {
      detail: `调用工具 ${toDetailText(nestedEvent.toolName, "unknown")}`,
    });
    return;
  }

  if (nestedEvent.type === "tool_end") {
    ctx.patchExecutionStep(stepId, {
      detail: `工具完成 ${toDetailText(nestedEvent.toolName, "unknown")}`,
    });
    return;
  }

  if (nestedEvent.type === "done") {
    ctx.patchExecutionStep(stepId, {
      detail: toDetailText(nestedEvent.text, "Agent 已完成。"),
    });
  }
};

export const applyTavernCollaborationTraceEvent = (
  ctx: TavernPageContextValue,
  event: AgentClientCollaborationEvent,
  options: CollaborationTraceOptions = {},
) => {
  persistCollaborationTraceEvent(ctx, event, options);

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
    ctx.patchExecutionStep(agentTraceStepId(event.workflowRunId, event.step.stepId), {
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
    ctx.patchExecutionStep(workflowTraceStepId(event.workflowRunId), {
      detail: `${event.result.steps.length} 步完成，${event.result.skippedSteps?.length ?? 0} 步跳过`,
      status: "done",
    });
    return;
  }

  if (event.type === "collaboration_result") {
    ctx.patchExecutionStep(workflowTraceStepId(event.workflowRunId), {
      detail: `${event.steps.length} 步完成，${event.skippedSteps?.length ?? 0} 步跳过`,
      status: "done",
    });
  }
};
