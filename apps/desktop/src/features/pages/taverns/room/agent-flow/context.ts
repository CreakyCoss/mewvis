import type {
  AgentProtocolMessage,
  AgentProtocolProgress,
  AgentProtocolReference,
} from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernRoomRuntime } from "@/features/pages/taverns/room/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";
import { getTavernMessageRawText } from "@/features/pages/taverns/room/model/message-body";
import { getTavernAgentFlowPublicText, parseTavernAgentFlowOutput } from "./parse";
import { getTavernAgentFlowPublicOutputKey, resolveTavernAgentFlowPresentation } from "./presentation";
import type { TavernAgentFlowContext, TavernAgentFlowInput, TavernAgentFlowPresentation } from "./types";

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => !!value);

const joinLines = (values: Array<string | null | undefined>) => compact(values).join("\n");

const labelValue = (label: string, value?: string | null) => {
  const text = value?.trim();
  return text ? `${label}: ${text}` : "";
};

const normalizeMaxSpeakers = ({
  maxSpeakers,
  fallback,
  candidateCount,
}: {
  maxSpeakers?: number;
  fallback?: number;
  candidateCount: number;
}) => {
  const resolved = Number.isFinite(maxSpeakers) ? maxSpeakers : fallback;
  const normalized = Math.max(1, Math.floor(resolved || 1));
  return Math.min(normalized, Math.max(1, candidateCount));
};

const resolveCandidateCharacters = ({
  characters,
  selectedCharacterIds,
}: {
  characters: TavernCharacter[];
  selectedCharacterIds?: string[];
}) => {
  const selectedIds = new Set(selectedCharacterIds?.filter(Boolean) ?? []);
  const candidates = selectedIds.size > 0 ? characters.filter((character) => selectedIds.has(character.id)) : characters;
  return candidates.length > 0 ? candidates : characters;
};

const extractStoredMessagePublicText = ({
  message,
  presentation,
}: {
  message: TavernMessage;
  presentation: TavernAgentFlowPresentation;
}) => {
  if (message.body.type === "text") {
    return getTavernMessageRawText(message).trim();
  }

  const parsed = parseTavernAgentFlowOutput(getTavernMessageRawText(message));
  if (message.role === "narrator") {
    return parsed.data.narrative?.trim() || parsed.data.publicReply?.trim() || parsed.unwrappedText?.trim() || "";
  }

  return getTavernAgentFlowPublicText({
    parsed,
    preferredOutput: getTavernAgentFlowPublicOutputKey(presentation),
  });
};

const toAgentProtocolHistoryMessage = ({
  message,
  characterById,
  presentation,
  userPersonaName,
}: {
  message: TavernMessage;
  characterById: Map<string, TavernCharacter>;
  presentation: TavernAgentFlowPresentation;
  userPersonaName: string;
}): AgentProtocolMessage | null => {
  const content = extractStoredMessagePublicText({ message, presentation }).trim();
  if (!content) {
    return null;
  }

  if (message.role === "user") {
    return {
      role: "user",
      speaker: userPersonaName || "用户",
      content,
      visibility: "public",
      createdAt: message.createdAt,
    };
  }

  if (message.role === "narrator") {
    return {
      role: "narrator",
      speaker: "旁白",
      content,
      visibility: "public",
      createdAt: message.createdAt,
    };
  }

  const character = message.characterId ? characterById.get(message.characterId) : null;
  return {
    role: "agent",
    speaker: character?.name ?? "角色",
    content,
    visibility: "public",
    createdAt: message.createdAt,
  };
};

export const createTavernAgentFlowPublicMessage = ({
  character,
  content,
}: {
  character: TavernCharacter;
  content: string;
}): AgentProtocolMessage => ({
  role: "agent",
  speaker: character.name,
  content,
  visibility: "public",
});

export const buildTavernAgentFlowContext = (input: TavernAgentFlowInput): TavernAgentFlowContext => {
  const presentation = resolveTavernAgentFlowPresentation(input.room.presentation.profile.profileId);
  const candidateCharacters = resolveCandidateCharacters({
    characters: input.characters,
    selectedCharacterIds: input.selectedCharacterIds,
  });
  const characterById = new Map(input.characters.map((character) => [character.id, character]));
  const userPersonaName = input.room.user.personaName || "用户";
  const currentInstruction =
    (input.trigger?.type === "scene_drive" ? input.trigger.directive || input.currentUserText : input.currentUserText)
      .trim() || "继续推进当前场景。";

  return {
    presentation,
    candidateCharacters,
    userPersonaName,
    currentInstruction,
    references: input.references ?? [],
    maxSpeakers: normalizeMaxSpeakers({
      maxSpeakers: input.maxSpeakers,
      fallback: input.room.presentation.settings.directorMaxSpeakers,
      candidateCount: candidateCharacters.length,
    }),
    historyMessages: input.messages.flatMap((message) => {
      const historyMessage = toAgentProtocolHistoryMessage({
        message,
        characterById,
        presentation,
        userPersonaName,
      });
      return historyMessage ? [historyMessage] : [];
    }),
  };
};

export const buildTavernAgentFlowProgress = (room: TavernRoomRuntime): AgentProtocolProgress => {
  const sceneStatus = room.scene.sceneStatus;

  return {
    summary: joinLines([
      labelValue("房间", room.identity.title),
      labelValue("当前场景", room.scene.scene),
      labelValue("场景目标", room.scene.sceneGoal),
      labelValue("剧情方向", room.scene.storyDirection),
      labelValue("当前剧情节点", room.story.graph.nodes.find((node) => node.id === room.story.activeNodeId)?.title),
    ]),
    facts: compact([
      labelValue("地点", sceneStatus?.location),
      labelValue("时间", sceneStatus?.timeLabel),
      labelValue("天气", sceneStatus?.weather),
      labelValue("氛围", sceneStatus?.atmosphere),
      labelValue("阶段", sceneStatus?.scenePhase),
      labelValue("即时威胁", sceneStatus?.immediateThreat),
      labelValue("世界/背景摘要", room.story.outline),
      labelValue("故事目标", room.story.goal),
    ]),
    recentEvents: compact([
      labelValue("最近情节", room.scene.plot),
      labelValue("转场/承接", room.scene.transition),
      labelValue("公开记忆", room.scene.memoryLayers.public || room.scene.memory),
    ]),
  };
};

const formatCharacterBrief = ({
  character,
  room,
  target,
  speaker,
}: {
  character: TavernCharacter;
  room: TavernRoomRuntime;
  target: "director" | "character";
  speaker?: TavernCharacter;
}) => {
  const publicStatus = room.scene.characterPublicStatuses[character.id];
  const privateStatus = room.scene.characterPrivateStatuses[character.id];
  const memoryLayers = room.scene.characterMemoryLayers[character.id];
  const roomMemory = room.cast.characterMemories[character.id];
  const canSeePrivate = target === "director" || speaker?.id === character.id;

  return joinLines([
    `角色: ${character.name} (${character.id})`,
    labelValue("描述", character.description),
    labelValue("说话风格", character.speakingStyle),
    labelValue("写作风格", character.writingStyle),
    labelValue("目标", character.goals),
    labelValue("公开状态", joinLines([
      labelValue("位置", publicStatus?.location),
      labelValue("姿态", publicStatus?.posture),
      labelValue("可见情绪", publicStatus?.visibleMood),
      labelValue("公开目标", publicStatus?.publicGoal),
    ])),
    labelValue("角色公开记忆", memoryLayers?.public || roomMemory),
    canSeePrivate ? labelValue("角色已知信息", memoryLayers?.known) : "",
    canSeePrivate
      ? labelValue("角色私有状态", joinLines([
          labelValue("私下情绪", privateStatus?.privateMood),
          labelValue("隐藏目标", privateStatus?.hiddenGoal),
          labelValue("私有记忆", memoryLayers?.privateSelf),
        ]))
      : "",
    target === "director" ? labelValue("导演秘密", memoryLayers?.directorSecret) : "",
  ]);
};

const buildPromptBlockReference = ({
  room,
  target,
}: {
  room: TavernRoomRuntime;
  target: "director" | "character";
}): AgentProtocolReference[] => {
  const blocks = [
    ...room.presentation.prompt.blocks,
    ...room.scene.promptOverrides.blocks,
  ]
    .filter((block) => block.enabled && (block.target === target || block.target === "bridge"))
    .sort((left, right) => left.order - right.order);

  if (blocks.length === 0) {
    return [];
  }

  return [
    {
      title: `${target === "director" ? "导演" : "角色"}可用业务提示`,
      source: "tavern_prompt_blocks",
      content: blocks.map((block) => `## ${block.label}\n${block.text.trim()}`).join("\n\n"),
    },
  ];
};

export const buildTavernAgentFlowReferences = ({
  room,
  characters,
  presentation,
  target,
  speaker,
  files,
}: {
  room: TavernRoomRuntime;
  characters: TavernCharacter[];
  presentation: TavernAgentFlowPresentation;
  target: "director" | "character";
  speaker?: TavernCharacter;
  files: TavernReferencedFile[];
}): AgentProtocolReference[] => [
  {
    title: "呈现规则",
    source: `presentation:${presentation.id}`,
    content: joinLines([
      labelValue("模式", presentation.label),
      target === "director" ? presentation.directorAddendum : presentation.characterAddendum,
    ]),
  },
  {
    title: "房间与场景",
    source: "room_runtime",
    content: joinLines([
      labelValue("房间", room.identity.title),
      labelValue("用户身份", room.user.personaName || "用户"),
      labelValue("场景", room.scene.scene),
      labelValue("场景目标", room.scene.sceneGoal),
      labelValue("剧情", room.scene.plot),
      labelValue("推进方向", room.scene.storyDirection),
      labelValue("转场", room.scene.transition),
      labelValue("必要记忆", room.scene.memoryLayers.required),
      labelValue("公开记忆", room.scene.memoryLayers.public || room.scene.memory),
      target === "director" ? labelValue("导演秘密", room.scene.memoryLayers.directorSecret) : "",
    ]),
  },
  {
    title: target === "director" ? "候选角色" : "在场角色",
    source: "characters",
    content: characters
      .map((character) =>
        formatCharacterBrief({
          character,
          room,
          target,
          speaker,
        }),
      )
      .join("\n\n"),
  },
  ...(speaker
    ? [
        {
          title: "当前被调度角色",
          source: `character:${speaker.id}`,
          content: formatCharacterBrief({
            character: speaker,
            room,
            target,
            speaker,
          }),
        },
      ]
    : []),
  ...buildPromptBlockReference({ room, target }),
  ...files.map((file): AgentProtocolReference => ({
    title: file.path,
    source: "referenced_file",
    content: file.content,
  })),
];
