import { buildTavernBridgeSystemPrompt } from "@/features/pages/taverns/tavern/runtime/prompt/bridge/system-prompt";
import {
  buildTavernDirectorPromptContext,
  buildTavernDirectorRuntimeInstruction,
} from "@/features/pages/taverns/tavern/runtime/director/prompt";
import { buildTavernReplyAgentRequest } from "@/features/pages/taverns/tavern/runtime/reply/request";
import {
  tavernBridgeSessionRootDir,
  tavernCharacterAgentRoleId,
  tavernDirectorAgentRoleId,
} from "@/features/pages/taverns/tavern/core/agent-role";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type {
  TavernDirectorLoopCollaborationInput,
  TavernSpeakerCollaborationInput,
  TavernCollaborationInput,
} from "./types";

const TAVERN_DIRECTOR_LOOP_DEFAULT_MAX_ROUNDS = 2;

const tavernSpeakerWorkflowMaxSteps = (speakerCount: number) => Math.max(8, speakerCount * 4);

export const buildTavernDirectorLoopCollaborationInput = ({
  workspacePath,
  runtimeModel,
  room,
  characters,
  speakerInputs,
  messages,
  references,
  currentUserText,
  turnTrigger = { type: "user" },
  selectedTargetCharacterIds = [],
  maxSpeakers = 3,
  maxRounds = TAVERN_DIRECTOR_LOOP_DEFAULT_MAX_ROUNDS,
  storyContext,
}: TavernDirectorLoopCollaborationInput): TavernCollaborationInput => {
  const speakers = speakerInputs.map((speakerInput) => speakerInput.character);
  const directorPromptContext = buildTavernDirectorPromptContext({
    room,
    characters,
    messages,
    references,
    currentUserText,
    turnTrigger,
    selectedTargetCharacterIds,
    maxSpeakers,
    storyContext,
  });
  const directorRoleId = tavernDirectorAgentRoleId(room);
  const speakerRequests = speakerInputs.map((speakerInput) => ({
    speakerInput,
    speaker: speakerInput.character,
    request: buildTavernReplyAgentRequest({
      room,
      activeCharacter: speakerInput.character,
      characters,
      messages,
      references,
      currentUserText,
      turnInstruction: speakerInput.turnInstruction,
      allowNonverbalReply: speakerInput.allowNonverbalReply === true,
      storyContext,
    }),
  }));
  const normalizedMaxRounds = normalizePositiveInteger(maxRounds, TAVERN_DIRECTOR_LOOP_DEFAULT_MAX_ROUNDS);
  const workerTargets = speakerRequests.map(({ speaker, request }) => ({
    characterId: speaker.id,
    characterName: speaker.name,
    participantId: request.agentRoleId,
  }));

  return {
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    mode: "supervisor.dispatch-loop",
    participants: [
      {
        id: directorRoleId,
        kind: "supervisor",
        label: "酒馆导演",
        runtimeModel,
        systemPrompt: buildTavernBridgeSystemPrompt(room),
        requestContext: directorPromptContext.requestContext,
        runtimeInstruction: buildSupervisorDispatchRuntimeInstruction({
          runtimeInstruction: buildDirectorLoopRuntimeInstruction({
            runtimeInstruction: buildTavernDirectorRuntimeInstruction(directorPromptContext),
            speakers,
          }),
          workerTargets,
        }),
        userMessage: directorPromptContext.isSceneDriveTurn
          ? "请根据当前场景和上一轮角色回复继续自推动酒馆场景，并按 supervisor.dispatch-loop JSON 输出。"
          : "请根据当前用户输入和上一轮角色回复，给每个候选角色打分，决定是否继续调度，并按 supervisor.dispatch-loop JSON 输出。",
        capabilities: ["score", "select", "dispatch", "evaluate"],
        metadata: {
          roomId: room.id,
          role: "director",
        },
      },
      ...speakerRequests.map(({ speaker, speakerInput, request }) => ({
        id: tavernCharacterAgentRoleId(room, speaker),
        kind: "worker" as const,
        label: speaker.name,
        runtimeModel: speakerInput.runtimeModel,
        systemPrompt: request.systemPrompt,
        userMessage: request.userMessage,
        requestContext: request.requestContext,
        runtimeInstruction: buildLoopSpeakerRuntimeInstruction({
          runtimeInstruction: request.runtimeInstruction,
          speakers,
        }),
        capabilities: ["speak", "act"],
        metadata: {
          characterId: speaker.id,
          characterName: speaker.name,
          targetAliases: [speaker.id, speaker.name],
        },
      })),
    ],
    context: {
      roomId: room.id,
      currentUserText,
      selectedTargetCharacterIds,
      speakerIds: speakers.map((speaker) => speaker.id),
      maxSpeakers,
      turnTrigger,
      workerTargets,
    },
    options: {
      maxRounds: normalizedMaxRounds,
      minScore: 1,
    },
  };
};

export const buildTavernSpeakerCollaborationInput = ({
  workspacePath,
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
}: TavernSpeakerCollaborationInput): TavernCollaborationInput => {
  const allowNonverbalReplyIds = new Set(allowNonverbalReplyCharacterIds);
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
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room),
    agents: requests.map(({ speaker, request }) => ({
      id: tavernCharacterAgentRoleId(room, speaker),
      label: speaker.name,
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
        outputKey: tavernSpeakerReplyOutputKey(speaker),
      })),
      metadata: {
        roomId: room.id,
        speakerIds: speakers.map((speaker) => speaker.id),
        currentUserText,
      },
    },
  };
};

const tavernSpeakerReplyOutputKey = (speaker: Pick<TavernSpeakerCollaborationInput["speakers"][number], "id">) =>
  `reply:${speaker.id}`;

const tavernSpeakerWorkflowStepId = (
  speaker: Pick<TavernSpeakerCollaborationInput["speakers"][number], "id">,
  index: number,
) => `speaker-${speaker.id}-${index + 1}`;

const normalizePositiveInteger = (value: number | null | undefined, fallback: number) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
};

const buildSupervisorDispatchRuntimeInstruction = ({
  runtimeInstruction,
  workerTargets,
}: {
  runtimeInstruction?: string | null;
  workerTargets: Array<{
    characterId: string;
    characterName: string;
    participantId: string;
  }>;
}) =>
  [
    runtimeInstruction,
    "",
    "<supervisor_dispatch_loop_contract>",
    "你当前运行在通用 supervisor.dispatch-loop 模式中；最终输出契约以本段为准。",
    "必须给所有候选角色评分，且每轮最多选择一个角色回复。",
    "candidates[].targetId 和 selectedTargetId 必须使用下面的 participantId，而不是 characterId。",
    JSON.stringify(workerTargets, null, 2),
    "输出严格 JSON：",
    "{",
    '  "status": "continue" | "complete" | "blocked",',
    '  "candidates": [{ "targetId": string, "score": number, "reason": string, "instruction": string }],',
    '  "selectedTargetId": string,',
    '  "selectedInstruction": string,',
    '  "reason": string,',
    '  "artifacts": [',
    '    { "type": "narrator" | "ambientAction", "content": string, "targetId": string }',
    ,
    "  ]",
    ,
    "}",
    ,
    "如果只需要旁白或环境动作而不需要角色回复，status 使用 complete，并把内容放入 artifacts。",
    "</supervisor_dispatch_loop_contract>",
  ]
    .filter(Boolean)
    .join("\n");

const buildDirectorLoopRuntimeInstruction = ({
  runtimeInstruction,
  speakers,
}: {
  runtimeInstruction?: string | null;
  speakers: TavernCharacter[];
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
  ]
    .filter(Boolean)
    .join("\n");
};

const buildLoopSpeakerRuntimeInstruction = ({
  runtimeInstruction,
  speakers,
}: {
  runtimeInstruction?: string | null;
  speakers: TavernCharacter[];
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
  ]
    .filter(Boolean)
    .join("\n");
};

const buildSpeakerOutputsTemplate = (speakers: TavernCharacter[]) =>
  speakers
    .map((speaker) =>
      [`【${speaker.name} / ${speaker.id}】`, `{{ outputs.${tavernSpeakerReplyOutputKey(speaker)} }}`].join("\n"),
    )
    .join("\n\n");

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

  const priorReplyTemplate = priorSpeakers
    .map((speaker) =>
      [`【${speaker.name} / ${speaker.id}】`, `{{ outputs.${tavernSpeakerReplyOutputKey(speaker)} }}`].join("\n"),
    )
    .join("\n\n");

  return [
    runtimeInstruction,
    "",
    "<collaboration_previous_speaker_replies>",
    "以下内容由同一协作 workflow 的前序角色刚刚生成，视为本轮现场已经公开发生的回复；承接它们，不要重复它们。",
    priorReplyTemplate,
    "</collaboration_previous_speaker_replies>",
  ]
    .filter(Boolean)
    .join("\n");
};
