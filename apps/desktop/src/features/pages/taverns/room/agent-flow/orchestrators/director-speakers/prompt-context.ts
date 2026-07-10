import type { AgentProtocolProgress, AgentProtocolReference } from "@/features/pages/taverns/room/agent-protocol/types";
import type { PromptFileReference } from "@/features/ai/components/context-tools";
import type { TavernCharacter, TavernStoryData } from "@/features/pages/taverns/room/model";
import type { TavernAgentFlowPresentation } from "../../types";

const compact = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter((value): value is string => !!value);

const joinLines = (values: Array<string | null | undefined>) => compact(values).join("\n");

const labelValue = (label: string, value?: string | null) => {
  const text = value?.trim();
  return text ? `${label}: ${text}` : "";
};

export const buildTavernAgentFlowProgress = (story: TavernStoryData): AgentProtocolProgress => {
  const sceneStatus = story.scene.status;

  return {
    summary: joinLines([
      labelValue("房间", story.title),
      labelValue("当前场景", story.scene.scene),
      labelValue("场景目标", story.scene.goal),
      labelValue("剧情方向", story.scene.direction),
      labelValue("当前剧情节点", story.node.title),
    ]),
    facts: compact([
      labelValue("地点", sceneStatus?.location),
      labelValue("时间", sceneStatus?.timeLabel),
      labelValue("天气", sceneStatus?.weather),
      labelValue("氛围", sceneStatus?.atmosphere),
      labelValue("阶段", sceneStatus?.scenePhase),
      labelValue("即时威胁", sceneStatus?.immediateThreat),
    ]),
    recentEvents: compact([
      labelValue("最近情节", story.scene.plot),
      labelValue("转场/承接", story.scene.transition),
      labelValue("场景记忆", story.scene.memory),
    ]),
  };
};

export const buildTavernAgentFlowReferences = ({
  story,
  characters,
  presentation,
  target,
  speaker,
  files,
}: {
  story: TavernStoryData;
  characters: TavernCharacter[];
  presentation: TavernAgentFlowPresentation;
  target: "director" | "character";
  speaker?: TavernCharacter;
  files: PromptFileReference[];
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
      labelValue("房间", story.title),
      labelValue("玩家身份", story.playerName),
      labelValue("场景", story.scene.scene),
      labelValue("场景目标", story.scene.goal),
      labelValue("剧情", story.scene.plot),
      labelValue("推进方向", story.scene.direction),
      labelValue("转场", story.scene.transition),
      labelValue("场景记忆", story.scene.memory),
    ]),
  },
  {
    title: target === "director" ? "候选角色" : "在场角色",
    source: "characters",
    content: characters.map((character) => formatCharacterBrief({ character, target, speaker })).join("\n\n"),
  },
  ...(speaker
    ? [
        {
          title: "当前被调度角色",
          source: `character:${speaker.id}`,
          content: formatCharacterBrief({
            character: speaker,
            target,
            speaker,
          }),
        },
      ]
    : []),
  ...buildPromptBlockReference({ story, target }),
  ...files.map((file): AgentProtocolReference => ({
    title: file.path,
    source: "referenced_file",
    content: file.content,
  })),
];

const formatCharacterBrief = ({
  character,
  target,
  speaker,
}: {
  character: TavernCharacter;
  target: "director" | "character";
  speaker?: TavernCharacter;
}) => {
  const memory = character.memory;
  const canSeePrivate = target === "director" || speaker?.id === character.id;

  return joinLines([
    `角色: ${character.name} (${character.id})`,
    labelValue("描述", character.description),
    labelValue("说话风格", character.speakingStyle),
    labelValue("写作风格", character.writingStyle),
    labelValue("目标", character.goals),
    labelValue("公开关系", character.publicRelationshipSummary),
    canSeePrivate ? labelValue("关系", character.relationshipSummary) : "",
    labelValue("角色必要记忆", memory?.required),
    labelValue("角色公开记忆", memory?.public),
    canSeePrivate ? labelValue("角色已知信息", memory?.known) : "",
    canSeePrivate ? labelValue("角色私有记忆", memory?.privateSelf) : "",
    target === "director" ? labelValue("导演秘密", memory?.directorSecret) : "",
  ]);
};

const buildPromptBlockReference = ({
  story,
  target,
}: {
  story: TavernStoryData;
  target: "director" | "character";
}): AgentProtocolReference[] => {
  const blocks = story.roomConfig.prompt.blocks
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
