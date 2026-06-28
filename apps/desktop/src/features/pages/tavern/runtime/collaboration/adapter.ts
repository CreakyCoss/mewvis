import {
  buildTavernBridgeSystemPrompt,
} from "../conversation";
import {
  buildTavernDirectorPromptContext,
  buildTavernDirectorRuntimeInstruction,
} from "../director/prompt";
import type {
  TavernDirectorPromptContext,
} from "../director/prompt";
import {
  buildTavernReplyAgentRequest,
} from "../reply/request";
import {
  tavernBridgeSessionRootDir,
  tavernCharacterAgentRoleId,
  tavernDirectorAgentRoleId,
} from "../../core";
import type {
  TavernDirectorCollaborationInput,
  TavernDirectorLoopCollaborationInput,
  TavernSpeakerCollaborationInput,
  TavernCollaborationInput,
} from "./types";

const TAVERN_DIRECTOR_WORKFLOW_MAX_STEPS = 8;
const TAVERN_DIRECTOR_LOOP_DEFAULT_MAX_ROUNDS = 2;

const tavernSpeakerWorkflowMaxSteps = (speakerCount: number) =>
  Math.max(8, speakerCount * 4);

const tavernDirectorLoopWorkflowMaxSteps = (
  speakerCount: number,
  maxRounds: number,
) => Math.max(12, maxRounds * (speakerCount + 5));

export type TavernDirectorCollaborationPlan = {
  input: TavernCollaborationInput;
  promptContext: TavernDirectorPromptContext;
};

export const buildTavernDirectorCollaborationPlan = ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
  references,
  currentUserText,
  turnTrigger = { type: "user" },
  selectedTargetCharacterIds = [],
  maxSpeakers = 3,
  randomEventOpportunity,
  storyContext,
}: TavernDirectorCollaborationInput): TavernDirectorCollaborationPlan => {
  const directorPromptContext = buildTavernDirectorPromptContext({
    room,
    characters,
    messages,
    references,
    currentUserText,
    turnTrigger,
    selectedTargetCharacterIds,
    maxSpeakers,
    randomEventOpportunity,
    storyContext,
  });
  const directorRoleId = tavernDirectorAgentRoleId(room);

  return {
    input: {
      type: "collaboration",
      workspacePath,
      sessionRootDir: tavernBridgeSessionRootDir(room),
      agents: [
        {
          id: directorRoleId,
          label: "酒馆导演",
          agentId: runtimeAgentId,
          runtimeModel,
          systemPrompt: buildTavernBridgeSystemPrompt(room),
        },
      ],
      workflow: {
        id: "tavern.director-turn",
        label: "酒馆导演调度",
        version: "1",
        maxSteps: TAVERN_DIRECTOR_WORKFLOW_MAX_STEPS,
        steps: [
          {
            id: "director",
            type: "agent",
            agentRoleId: directorRoleId,
            runtimeModel,
            userMessage: directorPromptContext.isSceneDriveTurn
              ? "请在没有用户角色发言的前提下，自推动本轮酒馆场景，并只输出严格合法 JSON。"
              : "请决定本轮酒馆对话的发言顺序、可选在场动作和可选插图提示，并只输出严格合法 JSON。",
            requestContext: directorPromptContext.requestContext,
            runtimeInstruction: buildTavernDirectorRuntimeInstruction(directorPromptContext),
            outputKey: "directorRaw",
          },
          {
            id: "normalizeDirectorDecision",
            type: "transform",
            dependsOn: ["director"],
            transform: "tavern.normalizeDirectorDecision",
            input: {
              raw: { $ref: "outputs.directorRaw" },
              characters: characters.map((character) => ({
                id: character.id,
                name: character.name,
              })),
              maxSpeakers,
              allowRandomEvent: directorPromptContext.canConsiderRandomEvent,
              allowIllustrationHints: directorPromptContext.canRequestIllustrationHints,
            },
            outputKey: "directorDecision",
          },
          {
            id: "routeDirectorDecision",
            type: "router",
            dependsOn: ["normalizeDirectorDecision"],
            router: "tavern.directorNextRoute",
            input: { $ref: "outputs.directorDecision" },
            routes: {
              speakers: "__end__",
              narrator: "__end__",
              end: "__end__",
            },
            outputKey: "directorRoute",
          },
        ],
        metadata: {
          roomId: room.id,
          currentUserText,
          selectedTargetCharacterIds,
        },
      },
    },
    promptContext: directorPromptContext,
  };
};

export const buildTavernDirectorCollaborationInput = (
  input: TavernDirectorCollaborationInput,
): TavernCollaborationInput => buildTavernDirectorCollaborationPlan(input).input;

export const buildTavernDirectorLoopCollaborationInput = ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  speakers,
  messages,
  references,
  currentUserText,
  turnTrigger = { type: "user" },
  selectedTargetCharacterIds = [],
  maxSpeakers = 3,
  maxRounds = TAVERN_DIRECTOR_LOOP_DEFAULT_MAX_ROUNDS,
  randomEventOpportunity,
  storyContext,
  turnInstructionByCharacterId = {},
  allowNonverbalReplyCharacterIds = [],
}: TavernDirectorLoopCollaborationInput): TavernCollaborationInput => {
  const directorPromptContext = buildTavernDirectorPromptContext({
    room,
    characters,
    messages,
    references,
    currentUserText,
    turnTrigger,
    selectedTargetCharacterIds,
    maxSpeakers,
    randomEventOpportunity,
    storyContext,
  });
  const directorRoleId = tavernDirectorAgentRoleId(room);
  const allowNonverbalReplyIds = new Set(allowNonverbalReplyCharacterIds);
  const speakerRequests = speakers.map((speaker) => ({
    speaker,
    request: buildTavernReplyAgentRequest({
      room,
      activeCharacter: speaker,
      characters,
      messages,
      references,
      currentUserText,
      turnInstruction: turnInstructionByCharacterId[speaker.id],
      allowNonverbalReply: allowNonverbalReplyIds.has(speaker.id),
      storyContext,
    }),
  }));
  const firstSpeakerStepId = speakerRequests[0]
    ? tavernSpeakerWorkflowStepId(speakerRequests[0].speaker, 0)
    : "__end__";
  const normalizedMaxRounds = normalizePositiveInteger(maxRounds, TAVERN_DIRECTOR_LOOP_DEFAULT_MAX_ROUNDS);

  return {
    type: "collaboration",
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agents: [
      {
        id: directorRoleId,
        label: "酒馆导演",
        agentId: runtimeAgentId,
        runtimeModel,
        systemPrompt: buildTavernBridgeSystemPrompt(room),
      },
      ...speakerRequests.map(({ speaker, request }) => ({
        id: tavernCharacterAgentRoleId(room, speaker),
        label: speaker.name,
        agentId: runtimeAgentId,
        runtimeModel,
        systemPrompt: request.systemPrompt,
      })),
    ],
    workflow: {
      id: "tavern.director-loop",
      label: "酒馆导演回环调度",
      version: "1",
      maxSteps: tavernDirectorLoopWorkflowMaxSteps(speakerRequests.length, normalizedMaxRounds),
      steps: [
        {
          id: "director",
          type: "agent" as const,
          agentRoleId: directorRoleId,
          runtimeModel,
          userMessage: directorPromptContext.isSceneDriveTurn
            ? "请根据当前场景和上一轮角色回复继续自推动酒馆场景，并只输出严格合法 JSON。"
            : "请根据当前用户输入和上一轮角色回复，决定是否继续调度角色发言，并只输出严格合法 JSON。",
          requestContext: directorPromptContext.requestContext,
          runtimeInstruction: buildDirectorLoopRuntimeInstruction({
            runtimeInstruction: buildTavernDirectorRuntimeInstruction(directorPromptContext),
            speakers,
          }),
          outputKey: "directorRaw",
        },
        {
          id: "normalizeDirectorDecision",
          type: "transform" as const,
          dependsOn: ["director"],
          transform: "tavern.normalizeDirectorDecision",
          input: {
            raw: { $ref: "outputs.directorRaw" },
            characters: characters.map((character) => ({
              id: character.id,
              name: character.name,
            })),
            maxSpeakers,
            allowRandomEvent: directorPromptContext.canConsiderRandomEvent,
            allowIllustrationHints: directorPromptContext.canRequestIllustrationHints,
          },
          outputKey: "directorDecision",
        },
        {
          id: "routeDirectorDecision",
          type: "router" as const,
          dependsOn: ["normalizeDirectorDecision"],
          router: "tavern.directorNextRoute",
          input: { $ref: "outputs.directorDecision" },
          routes: {
            speakers: firstSpeakerStepId,
            narrator: "__end__",
            end: "__end__",
          },
          outputKey: "directorRoute",
        },
        ...speakerRequests.map(({ speaker, request }, index) => ({
          id: tavernSpeakerWorkflowStepId(speaker, index),
          type: "agent" as const,
          agentRoleId: request.agentRoleId,
          runtimeModel,
          userMessage: request.userMessage,
          requestContext: request.requestContext,
          runtimeInstruction: buildSpeakerWorkflowRuntimeInstruction({
            runtimeInstruction: buildLoopSpeakerRuntimeInstruction({
              runtimeInstruction: request.runtimeInstruction,
              speakers,
            }),
            priorSpeakers: speakerRequests.slice(0, index).map((item) => item.speaker),
          }),
          when: {
            condition: "tavern.shouldRunSpeaker",
            input: {
              decision: { $ref: "outputs.directorDecision" },
              characterId: speaker.id,
            },
          },
          outputKey: tavernSpeakerReplyOutputKey(speaker),
        })),
        {
          id: "incrementDirectorLoopRound",
          type: "transform" as const,
          dependsOn: speakerRequests.length > 0
            ? [tavernSpeakerWorkflowStepId(speakerRequests[speakerRequests.length - 1].speaker, speakerRequests.length - 1)]
            : ["routeDirectorDecision"],
          transform: "tavern.incrementDirectorLoopRound",
          input: {
            current: { $ref: "outputs.directorLoopRound" },
          },
          outputKey: "directorLoopRound",
        },
        {
          id: "routeDirectorLoop",
          type: "router" as const,
          dependsOn: ["incrementDirectorLoopRound"],
          router: "tavern.directorLoopRoute",
          input: {
            round: { $ref: "outputs.directorLoopRound" },
            maxRounds: normalizedMaxRounds,
          },
          routes: {
            director: "director",
            end: "__end__",
          },
          outputKey: "directorLoopRoute",
        },
      ],
      metadata: {
        roomId: room.id,
        currentUserText,
        selectedTargetCharacterIds,
        speakerIds: speakers.map((speaker) => speaker.id),
        maxRounds: normalizedMaxRounds,
      },
    },
  };
};

export const buildTavernSpeakerCollaborationInput = ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  speakers,
  characters,
  messages,
  references,
  currentUserText,
  storyContext,
  turnInstructionByCharacterId = {},
  allowNonverbalReplyCharacterIds = [],
  directorDecision,
  directorDecisionRef,
}: TavernSpeakerCollaborationInput): TavernCollaborationInput => {
  const allowNonverbalReplyIds = new Set(allowNonverbalReplyCharacterIds);
  const speakerDecisionRef = resolveSpeakerDecisionRef({
    directorDecision,
    directorDecisionRef,
  });
  const requests = speakers.map((speaker) => ({
    speaker,
    request: buildTavernReplyAgentRequest({
      room,
      activeCharacter: speaker,
      characters,
      messages,
      references,
      currentUserText,
      turnInstruction: turnInstructionByCharacterId[speaker.id],
      allowNonverbalReply: allowNonverbalReplyIds.has(speaker.id),
      storyContext,
    }),
  }));

  return {
    type: "collaboration",
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agents: requests.map(({ speaker, request }) => ({
      id: tavernCharacterAgentRoleId(room, speaker),
      label: speaker.name,
      agentId: runtimeAgentId,
      runtimeModel,
      systemPrompt: request.systemPrompt,
    })),
    workflow: {
      id: "tavern.speaker-replies",
      label: "酒馆角色回复",
      version: "1",
      maxSteps: tavernSpeakerWorkflowMaxSteps(speakers.length),
      steps: requests.map(({ speaker, request }, index) => ({
        id: tavernSpeakerWorkflowStepId(speaker, index),
        type: "agent" as const,
        agentRoleId: request.agentRoleId,
        runtimeModel,
        userMessage: request.userMessage,
        requestContext: request.requestContext,
        runtimeInstruction: buildSpeakerWorkflowRuntimeInstruction({
          runtimeInstruction: request.runtimeInstruction,
          priorSpeakers: requests.slice(0, index).map((item) => item.speaker),
        }),
        when: speakerDecisionRef
          ? {
              condition: "tavern.shouldRunSpeaker",
              input: {
                decision: { $ref: speakerDecisionRef },
                characterId: speaker.id,
              },
            }
          : undefined,
        outputKey: tavernSpeakerReplyOutputKey(speaker),
      })),
      metadata: {
        roomId: room.id,
        speakerIds: speakers.map((speaker) => speaker.id),
        currentUserText,
        speakerDecisionRef,
      },
    },
    input: directorDecision === undefined
      ? undefined
      : {
          directorDecision,
        },
  };
};

const tavernSpeakerReplyOutputKey = (
  speaker: Pick<TavernSpeakerCollaborationInput["speakers"][number], "id">,
) => `reply:${speaker.id}`;

const tavernSpeakerWorkflowStepId = (
  speaker: Pick<TavernSpeakerCollaborationInput["speakers"][number], "id">,
  index: number,
) => `speaker-${speaker.id}-${index + 1}`;

const normalizePositiveInteger = (
  value: number | null | undefined,
  fallback: number,
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
};

const buildDirectorLoopRuntimeInstruction = ({
  runtimeInstruction,
  speakers,
}: {
  runtimeInstruction?: string | null;
  speakers: TavernDirectorLoopCollaborationInput["speakers"];
}) => {
  if (speakers.length === 0) {
    return runtimeInstruction;
  }

  return [
    runtimeInstruction,
    "",
    "<collaboration_latest_speaker_replies>",
    "以下是同一协作 workflow 上一轮角色公开回复；如果为空，说明这是本次协作的首轮导演调度。根据这些回复判断是否继续调度。",
    buildSpeakerOutputsTemplate(speakers),
    "</collaboration_latest_speaker_replies>",
  ].filter(Boolean).join("\n");
};

const buildLoopSpeakerRuntimeInstruction = ({
  runtimeInstruction,
  speakers,
}: {
  runtimeInstruction?: string | null;
  speakers: TavernDirectorLoopCollaborationInput["speakers"];
}) => {
  if (speakers.length === 0) {
    return runtimeInstruction;
  }

  return [
    runtimeInstruction,
    "",
    "<collaboration_loop_context>",
    "以下是本次协作 workflow 已有的最近角色回复；承接已经发生的公开内容，不要重复输出。",
    buildSpeakerOutputsTemplate(speakers),
    "</collaboration_loop_context>",
  ].filter(Boolean).join("\n");
};

const buildSpeakerOutputsTemplate = (
  speakers: TavernDirectorLoopCollaborationInput["speakers"],
) => speakers.map((speaker) => [
  `【${speaker.name} / ${speaker.id}】`,
  `{{ outputs.${tavernSpeakerReplyOutputKey(speaker)} }}`,
].join("\n")).join("\n\n");

const buildSpeakerWorkflowRuntimeInstruction = ({
  runtimeInstruction,
  priorSpeakers,
}: {
  runtimeInstruction?: string | null;
  priorSpeakers: TavernSpeakerCollaborationInput["speakers"];
}) => {
  if (priorSpeakers.length === 0) {
    return runtimeInstruction;
  }

  const priorReplyTemplate = priorSpeakers.map((speaker) => [
    `【${speaker.name} / ${speaker.id}】`,
    `{{ outputs.${tavernSpeakerReplyOutputKey(speaker)} }}`,
  ].join("\n")).join("\n\n");

  return [
    runtimeInstruction,
    "",
    "<collaboration_previous_speaker_replies>",
    "以下内容由同一协作 workflow 的前序角色刚刚生成，视为本轮现场已经公开发生的回复；承接它们，不要重复它们。",
    priorReplyTemplate,
    "</collaboration_previous_speaker_replies>",
  ].filter(Boolean).join("\n");
};

const resolveSpeakerDecisionRef = ({
  directorDecision,
  directorDecisionRef,
}: {
  directorDecision?: unknown;
  directorDecisionRef?: string;
}) => {
  const explicitRef = directorDecisionRef?.trim();
  if (explicitRef) {
    return explicitRef;
  }
  return directorDecision === undefined ? null : "input.directorDecision";
};
