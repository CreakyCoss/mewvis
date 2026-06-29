import type {
  CollaborationAgentInvocation,
} from "../../contracts/step.js";
import type {
  CollaborationAgentRole,
} from "../../contracts/workflow.js";
import type {
  CollaborationModeDefinition,
  CollaborationModeParticipant,
  CollaborationModeRunInput,
} from "../contracts.js";
import {
  createModeRunInput,
  modeMetadata,
  modeWorkflowId,
  participantToAgentRole,
  participantsByKind,
  positiveIntegerOption,
  renderContextBlock,
  requireParticipant,
} from "../shared.js";

const modeId = "supervisor.dispatch-loop" as const;

const numberOption = (
  options: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number,
) => {
  const value = options?.[key];
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const booleanOption = (
  options: Record<string, unknown> | null | undefined,
  key: string,
  fallback: boolean,
) => {
  const value = options?.[key];
  return typeof value === "boolean" ? value : fallback;
};

const joinSections = (sections: Array<string | null | undefined>) =>
  sections.map((section) => section?.trim() ?? "").filter(Boolean).join("\n\n");

const participantSummary = (participant: CollaborationModeParticipant) => ({
  id: participant.id,
  label: participant.label ?? participant.id,
  capabilities: participant.capabilities ?? [],
  metadata: participant.metadata ?? null,
});

const buildSupervisorInstruction = ({
  contextBlock,
  maxRounds,
  minScore,
  allowNoDispatch,
  supervisor,
  workers,
}: {
  contextBlock: string;
  maxRounds: number;
  minScore: number;
  allowNoDispatch: boolean;
  supervisor: CollaborationModeParticipant;
  workers: CollaborationModeParticipant[];
}) => joinSections([
  supervisor.runtimeInstruction,
  [
    "你是一个通用多 agent 协作调度 supervisor。",
    "每一轮只选择一个最应该继续执行的 worker。",
    "你必须为所有候选 worker 打分，并只输出严格 JSON，不要输出 Markdown。",
  ].join("\n"),
  [
    "<available_workers>",
    JSON.stringify(workers.map(participantSummary), null, 2),
    "</available_workers>",
  ].join("\n"),
  contextBlock
    ? [
        "<collaboration_context>",
        contextBlock,
        "</collaboration_context>",
      ].join("\n")
    : null,
  [
    "<previous_dispatch_output>",
    "{{ outputs.workerDispatch }}",
    "</previous_dispatch_output>",
  ].join("\n"),
  [
    "<dispatch_policy>",
    `maxRounds=${maxRounds}`,
    `minScore=${minScore}`,
    `allowNoDispatch=${allowNoDispatch}`,
    "如果 status 是 complete 或 blocked，本轮不会继续分发 worker。",
    "如果没有需要执行的 worker，可以 status=complete 并通过 artifacts 返回说明。",
    "</dispatch_policy>",
  ].join("\n"),
  [
    "输出 JSON 格式：",
    "{",
    "  \"status\": \"continue\" | \"complete\" | \"blocked\",",
    "  \"candidates\": [{ \"targetId\": string, \"score\": number, \"reason\": string, \"instruction\": string }],",
    "  \"selectedTargetId\": string,",
    "  \"selectedInstruction\": string,",
    "  \"reason\": string,",
    "  \"artifacts\": [{ \"type\": string, \"content\": string, \"targetId\": string }]",
    ,
    "}",
  ].join("\n"),
]);

const buildWorkerRuntimeInstruction = ({
  contextBlock,
  participant,
}: {
  contextBlock: string;
  participant: CollaborationModeParticipant;
}) => joinSections([
  participant.runtimeInstruction,
  participant.instruction,
  "你只执行 supervisor 本轮分配给你的任务；不要替其他 worker 输出。",
  contextBlock
    ? [
        "<collaboration_context>",
        contextBlock,
        "</collaboration_context>",
      ].join("\n")
    : null,
  [
    "<latest_dispatch_summary>",
    "{{ outputs.workerDispatch }}",
    "</latest_dispatch_summary>",
  ].join("\n"),
]);

const buildDispatchCandidate = (
  participant: CollaborationModeParticipant,
  contextBlock: string,
): {
  targetId: string;
  invocation: CollaborationAgentInvocation;
} => ({
  targetId: participant.id,
  invocation: {
    id: participant.id,
    label: participant.label ?? participant.id,
    agentRoleId: participant.id,
    outputKey: `worker:${participant.id}`,
    userMessage: participant.userMessage?.trim() || "请根据 supervisor 的本轮指令完成回复。",
    requestContext: participant.requestContext ?? null,
    runtimeInstruction: buildWorkerRuntimeInstruction({
      contextBlock,
      participant,
    }),
    runtimeModel: participant.runtimeModel ?? null,
    allowedTools: participant.allowedTools,
    enabledSkills: participant.enabledSkills,
    resources: participant.resources ?? null,
    metadata: {
      ...(participant.metadata ?? {}),
      targetId: participant.id,
      participantKind: participant.kind,
    },
  },
});

const buildAgents = (
  participants: readonly CollaborationModeParticipant[],
): CollaborationAgentRole[] => participants.map(participantToAgentRole);

export const supervisorDispatchLoopMode: CollaborationModeDefinition = {
  id: modeId,
  label: "Supervisor Dispatch Loop",
  version: "1",
  build(input: CollaborationModeRunInput) {
    const supervisor = requireParticipant(input, "supervisor");
    const workers = participantsByKind(input, "worker");
    if (workers.length === 0) {
      throw new Error(`${modeId} 至少需要一个 worker participant`);
    }

    const maxRounds = positiveIntegerOption(input.options, "maxRounds", 2);
    const minScore = Math.max(0, Math.min(100, numberOption(input.options, "minScore", 1)));
    const allowNoDispatch = booleanOption(input.options, "allowNoDispatch", true);
    const contextBlock = renderContextBlock(input.context);
    const dispatchCandidates = workers.map((worker) =>
      buildDispatchCandidate(worker, contextBlock)
    );

    return createModeRunInput(input, {
      agents: buildAgents([supervisor, ...workers]),
      input: {
        context: input.context ?? null,
        mode: modeId,
        options: input.options ?? null,
      },
      workflow: {
        id: modeWorkflowId(modeId, input.requestId),
        label: "Supervisor Dispatch Loop",
        version: "1",
        executor: input.executor ?? null,
        maxSteps: Math.max(20, maxRounds * 8 + 4),
        steps: [
          {
            id: "supervisor",
            type: "agent",
            agentRoleId: supervisor.id,
            runtimeModel: supervisor.runtimeModel ?? null,
            userMessage: supervisor.userMessage?.trim() ||
              "请根据当前上下文、候选 worker 和上一轮输出，评估是否继续，并选择一个 worker。",
            requestContext: supervisor.requestContext ?? null,
            runtimeInstruction: buildSupervisorInstruction({
              contextBlock,
              maxRounds,
              minScore,
              allowNoDispatch,
              supervisor,
              workers,
            }),
            outputKey: "supervisorRaw",
          },
          {
            id: "normalizeSupervisorDecision",
            type: "transform",
            dependsOn: ["supervisor"],
            transform: "supervisor.dispatch-loop.normalizeDecision",
            input: {
              raw: { $ref: "outputs.supervisorRaw" },
            },
            outputKey: "supervisorDecision",
          },
          {
            id: "selectDispatchTarget",
            type: "transform",
            dependsOn: ["normalizeSupervisorDecision"],
            transform: "supervisor.dispatch-loop.selectDispatch",
            input: {
              decision: { $ref: "outputs.supervisorDecision" },
              dispatchCandidates,
              minScore,
              allowNoDispatch,
              round: { $ref: "outputs.supervisorRound" },
            },
            outputKey: "supervisorSelection",
          },
          {
            id: "routeDispatchSelection",
            type: "router",
            dependsOn: ["selectDispatchTarget"],
            router: "supervisor.dispatch-loop.routeSelection",
            input: { $ref: "outputs.supervisorSelection" },
            routes: {
              dispatch: "dispatchWorker",
              end: "__end__",
            },
            outputKey: "supervisorSelectionRoute",
          },
          {
            id: "dispatchWorker",
            type: "dispatch",
            dependsOn: ["routeDispatchSelection"],
            input: { $ref: "outputs.supervisorSelection" },
            mode: "serial",
            outputKey: "workerDispatch",
          },
          {
            id: "incrementSupervisorRound",
            type: "transform",
            dependsOn: ["dispatchWorker"],
            transform: "mode.incrementRound",
            input: { current: { $ref: "outputs.supervisorRound" } },
            outputKey: "supervisorRound",
          },
          {
            id: "routeSupervisorLoop",
            type: "router",
            dependsOn: ["incrementSupervisorRound"],
            router: "supervisor.dispatch-loop.routeLoop",
            input: {
              round: { $ref: "outputs.supervisorRound" },
              maxRounds,
            },
            routes: {
              supervisor: "supervisor",
              end: "__end__",
            },
            outputKey: "supervisorLoopRoute",
          },
        ],
        metadata: modeMetadata(input, {
          maxRounds,
          minScore,
          allowNoDispatch,
          participantIds: [supervisor, ...workers].map((participant) => participant.id),
        }),
      },
    });
  },
};
