import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { RuntimeModelInput } from "@/agent-client/types";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernCharacter, TavernDirectorProfile } from "@/features/pages/taverns/manage/model";
import { normalizeTavernDirectorProfile } from "../../core/scheduling-profile";
import { formatTavernCharacterRelationships } from "../../core/relationships";
import { runTavernOneShotAgent } from "../agent";

export type RunTavernDirectorProfileAgentInput = {
  workspacePath: string;
  runtimeModel?: RuntimeModelInput | null;
  room: TavernRoom;
  characters: TavernCharacter[];
  storyContext?: TavernStoryContextPackage;
};

const DIRECTOR_PROFILE_AGENT_ROLE_ID = "tavern-one-shot-director-profile";

const directorProfileSchema = `{
  "version": 1,
  "source": "generated",
  "globalGoals": ["稳定的全局调度目标"],
  "globalRules": ["稳定的玩法调度规则"],
  "characterProfiles": {
    "character-id": {
      "characterId": "character-id",
      "temperament": "稳定性格调度摘要",
      "speechBias": "very_low | low | balanced | high | very_high",
      "nonverbalBias": "very_low | low | balanced | high | very_high",
      "interestTags": ["感兴趣内容"],
      "goalTags": ["个人局内目标关键词"],
      "knowledgeTags": ["常掌握或关注的知识/线索"],
      "conflictStyle": "冲突处理方式",
      "socialStrategy": "社交/竞争策略",
      "speechTriggers": ["什么情况更想说话"],
      "silenceTriggers": ["什么情况更倾向沉默或动作回应"],
      "notes": "导演调度时的稳定补充"
    }
  }
}`;

const firstJsonObjectFromText = (text: string) => {
  const start = text.indexOf("{");
  if (start < 0) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
};

const parseDirectorProfileJson = (text: string) => {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : firstJsonObjectFromText(trimmed);
  if (!jsonText) {
    throw new Error("未找到可用的调度画像 JSON");
  }

  return JSON.parse(jsonText) as unknown;
};

const buildDirectorProfileSystemPrompt = () =>
  [
    "你是酒馆导演调度画像生成 agent，负责根据酒馆设定和角色资料生成低频稳定的调度画像。",
    "必须只输出一个严格 JSON 对象，不要输出 markdown、解释、注释或额外文本。",
    "画像只描述稳定特征：性格、发言倾向、兴趣、目标关键词、冲突方式、社交策略、触发发言/沉默的条件。",
    "不要写本轮临时状态，不要写当前血量/好感/刚发生的动作；这些由状态栏、任务、事实和每轮动态调度信号处理。",
    "characterProfiles 的 key 和 characterId 必须使用 request_context.characters 中给出的真实 character id。",
    "speechBias 表示默认开口欲望；nonverbalBias 表示更适合动作/神态回应的倾向。",
    "沉默寡言、冷淡、谨慎、观察者倾向 low 或 very_low；热情、竞争、主持、主动试探倾向 high 或 very_high。",
    "不能让角色替用户说话或行动；不能加入角色不可知的隐藏事实。",
    "",
    "<json_schema>",
    directorProfileSchema,
    "</json_schema>",
  ].join("\n");

const resolveRoomDirectorProfileScene = (room: TavernRoom) => {
  if (!room.scenes?.length) {
    throw new Error("当前酒馆缺少标准故事场景，无法生成调度画像。");
  }

  const activeInstance =
    room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ??
    room.sceneInstances[0] ??
    null;
  const activeSceneId = activeInstance?.sceneId ?? room.activeSceneId;
  const activeScene =
    room.scenes.find((scene) => scene.id === activeSceneId) ??
    room.scenes.find((scene) => scene.id === room.activeSceneId) ??
    room.scenes[0];
  const scene = activeInstance?.sceneId === activeScene.id ? activeInstance : activeScene;

  return {
    scene: scene.scene,
    goal: scene.sceneGoal,
    plot: scene.plot,
    direction: scene.storyDirection,
    memory: scene.memory,
  };
};

const resolveDirectorProfileScene = (room: TavernRoom, storyContext?: TavernStoryContextPackage) => {
  const activeScene = storyContext?.graph.activeScene;
  if (activeScene) {
    return {
      scene: activeScene.scene,
      goal: activeScene.goal,
      plot: activeScene.plot,
      direction: activeScene.direction,
      memory: storyContext.memory.manual,
    };
  }

  return resolveRoomDirectorProfileScene(room);
};

const buildDirectorProfileRequestContext = (
  room: TavernRoom,
  characters: TavernCharacter[],
  storyContext?: TavernStoryContextPackage,
) => {
  const activeInstance =
    room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ?? room.sceneInstances[0];
  const characterMemoryText = (characterId: string) => {
    const layers = activeInstance?.characterMemoryLayers?.[characterId];
    return [layers?.required, layers?.public, layers?.known, layers?.privateSelf]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join("\n");
  };
  const activeScene = resolveDirectorProfileScene(room, storyContext);

  return JSON.stringify(
    {
      room: {
        title: storyContext?.story.title ?? room.title,
        promptBlocks: room.prompt.blocks
          .filter((block) => block.enabled && block.text.trim())
          .map((block) => ({
            target: block.target,
            label: block.label,
            source: block.source,
            text: block.text,
          })),
        storyOutline: storyContext?.story.outline ?? room.storyOutline,
        storyGoal: storyContext?.story.goal ?? room.storyGoal,
        scene: activeScene.scene,
        sceneGoal: activeScene.goal,
        scenePlot: activeScene.plot,
        sceneDirection: activeScene.direction,
        memory: activeScene.memory,
        directorSchedulingRules: room.settings.directorScheduling.speakerMotivation.rules,
        directorSchedulingInstruction: room.settings.directorScheduling.instruction,
        currentProfile: room.settings.directorScheduling.profile ?? null,
      },
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        description: character.description,
        speakingStyle: character.speakingStyle,
        writingStyle: character.writingStyle ?? "",
        replyStylePrompt: character.replyStylePrompt ?? "",
        goals: character.goals ?? "",
        relationships: formatTavernCharacterRelationships({
          character,
          characters,
          userPersonaName: room.userPersonaName,
          relationshipOverrides: room.relationshipOverrides,
          statusSnapshot: room.statusSnapshot,
        }),
        memory: characterMemoryText(character.id),
        publicStatus: room.characterPublicStatuses[character.id] ?? null,
        privateStatus: room.characterPrivateStatuses[character.id] ?? null,
      })),
    },
    null,
    2,
  );
};

export const runTavernDirectorProfileAgent = async ({
  workspacePath,
  runtimeModel,
  room,
  characters,
  storyContext,
}: RunTavernDirectorProfileAgentInput): Promise<TavernDirectorProfile> => {
  const result = await runTavernOneShotAgent({
    workspacePath,
    agentRoleId: DIRECTOR_PROFILE_AGENT_ROLE_ID,
    runtimeModel,
    systemPrompt: buildDirectorProfileSystemPrompt(),
    requestContext: buildDirectorProfileRequestContext(room, characters, storyContext),
    runtimeInstruction: "生成酒馆导演调度稳定画像，只输出 JSON。",
    userMessage: `为酒馆「${room.title}」重新生成导演调度画像。`,
    allowedTools: [],
    enabledSkills: [],
  });
  const parsed = parseDirectorProfileJson(result.text);
  const profile = normalizeTavernDirectorProfile(parsed, {
    characters,
    source: "generated",
    updatedAt: Date.now(),
  });
  if (!profile) {
    throw new Error("调度画像生成结果为空");
  }

  return profile;
};
