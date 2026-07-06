import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import { formatTavernRuntimeMessagesForSummary } from "../../conversation";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import { tavernMessagesToRuntimeMessages } from "../../prompt";
import {
  buildTavernStoryContextPackage,
  formatTavernStoryGraphContext,
  formatTavernStoryLorebookEntries,
} from "../../../adapters/story";
import { formatTavernCharacterRelationships } from "../../../core";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernQuickSummaryInput } from "./types";

const RECENT_MESSAGE_LIMIT = 80;

const characterBrief = (room: TavernRoom, characters: TavernCharacter[]) =>
  characters
    .map((character) =>
      [
        `- ${character.name}`,
        `设定：${character.description}`,
        character.goals ? `目标：${character.goals}` : "",
        (() => {
          const relationships = formatTavernCharacterRelationships({
            character,
            characters,
            userPersonaName: room.userPersonaName,
            relationshipOverrides: room.relationshipOverrides,
            statusSnapshot: room.statusSnapshot,
          });
          return relationships ? `关系：${relationships}` : "";
        })(),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

const characterMemories = (room: TavernRoom, characters: TavernCharacter[]) => {
  const activeInstance =
    room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ?? room.sceneInstances[0];

  return characters
    .map((character) => {
      const layers = activeInstance?.characterMemoryLayers?.[character.id];
      const memory = [layers?.required, layers?.public, layers?.known, layers?.privateSelf]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join("\n");
      return memory ? `## ${character.name}\n${memory}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
};

const quickNovelLengthInstruction = (messageCount: number) => {
  if (messageCount >= 120) {
    return "篇幅目标 4500 到 7000 字，按剧情阶段分成自然段落，完整覆盖当前场景主要进展。";
  }

  if (messageCount >= 60) {
    return "篇幅目标 3000 到 5000 字，按剧情阶段分成自然段落，完整覆盖当前场景主要进展。";
  }

  if (messageCount >= 25) {
    return "篇幅目标 1800 到 3200 字，按剧情阶段分成自然段落，覆盖当前场景主要进展。";
  }

  return "篇幅目标 800 到 1600 字；内容较少时不要为了篇幅编造新剧情。";
};

export const buildTavernQuickContext = ({
  room,
  characters,
  messages,
  storyContext: inputStoryContext,
  conversationScope = "recent",
}: Pick<TavernQuickSummaryInput, "room" | "characters" | "messages"> & {
  storyContext?: TavernStoryContextPackage;
  conversationScope?: "recent" | "full";
}) => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const conversationMessages =
    conversationScope === "full" ? runtimeMessages : runtimeMessages.slice(-RECENT_MESSAGE_LIMIT);
  const conversationText = formatTavernRuntimeMessagesForSummary(conversationMessages);
  const storyContext = inputStoryContext ?? buildTavernStoryContextPackage({ room, characters });
  const activeScene = storyContext.graph.activeScene;
  const lorebookText = formatTavernStoryLorebookEntries(
    storyContext.world.lorebookEntries.filter((entry) => entry.enabled),
  );
  const storyGraphText = formatTavernStoryGraphContext(storyContext);
  const characterMemoryText = characterMemories(room, characters);

  return [
    storyContext.story.outline.trim() || storyContext.story.goal.trim()
      ? `<story_arc>\n${[
          storyContext.story.outline.trim(),
          storyContext.story.goal.trim() ? `终局目标：${storyContext.story.goal.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${storyContext.story.title}">`,
    activeScene?.scene ?? "",
    "</room>",
    "",
    activeScene?.plot.trim()
      ? `<scene_plot>\n${activeScene.plot.trim()}\n</scene_plot>`
      : "<scene_plot>（无）</scene_plot>",
    "",
    activeScene?.goal.trim()
      ? `<scene_goal>\n${activeScene.goal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    activeScene?.direction.trim()
      ? `<scene_direction>\n${activeScene.direction.trim()}\n</scene_direction>`
      : "<scene_direction>（无）</scene_direction>",
    "",
    activeScene?.transition.trim()
      ? `<scene_transition>\n${activeScene.transition.trim()}\n</scene_transition>`
      : "<scene_transition>（无）</scene_transition>",
    "",
    storyContext.memory.manual.trim()
      ? `<manual_memory>\n${storyContext.memory.manual.trim()}\n</manual_memory>`
      : "<manual_memory>（无）</manual_memory>",
    "",
    "<character_memories>",
    characterMemoryText || "（无）",
    "</character_memories>",
    "",
    "<story_graph>",
    storyGraphText || "（无）",
    "</story_graph>",
    "",
    "<lorebook>",
    lorebookText || "（无）",
    "</lorebook>",
    "",
    "<characters>",
    characterBrief(room, characters) || "（无）",
    "</characters>",
    "",
    conversationScope === "full"
      ? `<full_scene_conversation message_count="${runtimeMessages.length}">`
      : `<recent_conversation message_count="${conversationMessages.length}" total_message_count="${runtimeMessages.length}">`,
    conversationText || "（无）",
    conversationScope === "full" ? "</full_scene_conversation>" : "</recent_conversation>",
  ].join("\n");
};

export const buildTavernQuickNovelPrompt = ({
  room,
  characters,
  messages,
  storyContext,
}: Pick<TavernQuickSummaryInput, "room" | "characters" | "messages" | "storyContext">) => {
  const messageCount = messages.filter((message) => message.content.trim()).length;

  return [
    "<task>",
    "使用当前酒馆内容，按小说口吻写成完整、连贯的一章正文。",
    "</task>",
    "",
    "<rules>",
    "只基于已发生的对话、房间记忆、剧情结构、世界书和角色设定。",
    "可以补足衔接、动作、氛围和视角过渡，但不得新增关键事实、不得推进到当前对话之后、不得替用户做新的选择。",
    "需要覆盖 full_scene_conversation 中当前场景从开端到最近一轮的主要已发生内容，不要只改写最后几轮。",
    "不要只写概括段；需要把关键交流、转折、发现、情绪变化写成连续小说场面。",
    "保留角色说话方式和已出现的关系张力；角色对白要自然嵌入正文，不要机械复述聊天记录。",
    "使用中文小说正文，优先第三人称有限视角或贴近现场的叙事视角。",
    "不要写总结、提纲、列表、分析说明或“以下是小说”之类的引导语。",
    quickNovelLengthInstruction(messageCount),
    "如果模型上下文不足以容纳全部细节，优先保留开端、关键转折、最新局面和角色关系变化。",
    "</rules>",
    "",
    buildTavernQuickContext({
      room,
      characters,
      messages,
      storyContext,
      conversationScope: "full",
    }),
  ].join("\n");
};
