import type {
  CollaborationAgentRole,
  CollaborationModeParticipant,
  CollaborationModeRunInput,
} from "../../../../../protocol/index.js";
import type {
  CollaborationModeDefinition,
} from "../contracts.js";
import {
  createModeRunInput,
  modeMetadata,
  modeWorkflowId,
  participantToAgentRole,
  positiveIntegerOption,
  renderContextBlock,
  requireParticipant,
} from "../shared.js";

const modeId = "producer.review-rewrite-loop" as const;

const joinSections = (sections: Array<string | null | undefined>) =>
  sections.map((section) => section?.trim() ?? "").filter(Boolean).join("\n\n");

const buildProducerInstruction = ({
  contextBlock,
  producer,
}: {
  contextBlock: string;
  producer: CollaborationModeParticipant;
}) => joinSections([
  producer.runtimeInstruction,
  producer.instruction,
  "你是 producer，负责产出或重写目标 artifact。",
  contextBlock
    ? [
        "<collaboration_context>",
        contextBlock,
        "</collaboration_context>",
      ].join("\n")
    : null,
  [
    "<latest_review>",
    "{{ outputs.review }}",
    "</latest_review>",
  ].join("\n"),
]);

const buildReviewerInstruction = ({
  contextBlock,
  reviewer,
}: {
  contextBlock: string;
  reviewer: CollaborationModeParticipant;
}) => joinSections([
  reviewer.runtimeInstruction,
  reviewer.instruction,
  "你是 reviewer，负责审阅 producer 的 artifact，并只输出严格 JSON，不要输出 Markdown。",
  contextBlock
    ? [
        "<collaboration_context>",
        contextBlock,
        "</collaboration_context>",
      ].join("\n")
    : null,
  [
    "输出 JSON 格式：",
    "{",
    "  \"status\": \"approved\" | \"revise\" | \"blocked\",",
    "  \"score\": number,",
    "  \"reason\": string,",
    "  \"revisionInstruction\": string",
    "}",
  ].join("\n"),
]);

const buildAgents = (
  participants: readonly CollaborationModeParticipant[],
): CollaborationAgentRole[] => participants.map(participantToAgentRole);

export const producerReviewRewriteLoopMode: CollaborationModeDefinition = {
  id: modeId,
  label: "Producer Review Rewrite Loop",
  version: "1",
  build(input: CollaborationModeRunInput) {
    const producer = requireParticipant(input, "producer");
    const reviewer = requireParticipant(input, "reviewer");
    const maxRounds = positiveIntegerOption(input.options, "maxRounds", 2);
    const contextBlock = renderContextBlock(input.context);

    return createModeRunInput(input, {
      agents: buildAgents([producer, reviewer]),
      input: {
        context: input.context ?? null,
        mode: modeId,
        options: input.options ?? null,
      },
      workflow: {
        id: modeWorkflowId(modeId, input.requestId),
        label: "Producer Review Rewrite Loop",
        version: "1",
        runtime: input.runtime ?? null,
        maxSteps: Math.max(16, maxRounds * 5 + 4),
        steps: [
          {
            id: "producer",
            type: "agent",
            agentRoleId: producer.id,
            runtimeModel: producer.runtimeModel ?? null,
            userMessage: producer.userMessage?.trim() || "请产出或根据审阅意见重写 artifact。",
            requestContext: producer.requestContext ?? null,
            runtimeInstruction: buildProducerInstruction({
              contextBlock,
              producer,
            }),
            outputKey: "draft",
          },
          {
            id: "reviewer",
            type: "agent",
            dependsOn: ["producer"],
            agentRoleId: reviewer.id,
            runtimeModel: reviewer.runtimeModel ?? null,
            userMessage: reviewer.userMessage?.trim() || [
              "请审阅以下 artifact，并输出严格 JSON：",
              "",
              "{{ outputs.draft }}",
            ].join("\n"),
            requestContext: reviewer.requestContext ?? null,
            runtimeInstruction: buildReviewerInstruction({
              contextBlock,
              reviewer,
            }),
            outputKey: "reviewRaw",
          },
          {
            id: "normalizeReview",
            type: "transform",
            dependsOn: ["reviewer"],
            transform: "producer.review-rewrite-loop.normalizeReview",
            input: {
              raw: { $ref: "outputs.reviewRaw" },
            },
            outputKey: "review",
          },
          {
            id: "routeReview",
            type: "router",
            dependsOn: ["normalizeReview"],
            router: "producer.review-rewrite-loop.routeReview",
            input: { $ref: "outputs.review" },
            routes: {
              rewrite: "incrementReviewRound",
              end: "__end__",
            },
            outputKey: "reviewRoute",
          },
          {
            id: "incrementReviewRound",
            type: "transform",
            dependsOn: ["routeReview"],
            transform: "mode.incrementRound",
            input: { current: { $ref: "outputs.reviewRound" } },
            outputKey: "reviewRound",
          },
          {
            id: "routeReviewLoop",
            type: "router",
            dependsOn: ["incrementReviewRound"],
            router: "producer.review-rewrite-loop.routeLoop",
            input: {
              review: { $ref: "outputs.review" },
              round: { $ref: "outputs.reviewRound" },
              maxRounds,
            },
            routes: {
              producer: "producer",
              end: "__end__",
            },
            outputKey: "reviewLoopRoute",
          },
        ],
        metadata: modeMetadata(input, {
          maxRounds,
          participantIds: [producer.id, reviewer.id],
        }),
      },
    });
  },
};
