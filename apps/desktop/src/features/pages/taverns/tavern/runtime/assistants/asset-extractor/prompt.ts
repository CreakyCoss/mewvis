import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import { formatTavernRuntimeMessagesForSummary } from "../../conversation";
import { tavernMessagesToRuntimeMessages } from "../../prompt";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import { buildTavernStoryContextPackage, formatTavernStoryLorebookEntries } from "../../../adapters/story";
import { formatTavernCharacterRelationships } from "../../../core";
import type { TavernMessage } from "../../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

const characterBrief = (room: TavernRoom, characters: TavernCharacter[]) =>
  characters
    .map((character) =>
      [
        `id: ${character.id}`,
        `name: ${character.name}`,
        `description: ${character.description}`,
        character.goals ? `goals: ${character.goals}` : "",
        (() => {
          const relationships = formatTavernCharacterRelationships({
            character,
            characters,
            userPersonaName: room.userPersonaName,
            relationshipOverrides: room.relationshipOverrides,
          });
          return relationships ? `relationships: ${relationships}` : "";
        })(),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");

const characterMemoryBrief = (room: TavernRoom, characters: TavernCharacter[]) => {
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

export const buildTavernAssetExtractionPrompt = ({
  room,
  characters,
  messages,
  sourceMessages,
  currentUserText,
  storyContext: inputStoryContext,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  sourceMessages: TavernMessage[];
  currentUserText: string;
  storyContext?: TavernStoryContextPackage;
}) => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const sourceRuntimeMessages = tavernMessagesToRuntimeMessages({
    messages: sourceMessages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const storyContext = inputStoryContext ?? buildTavernStoryContextPackage({ room, characters });
  const activeScene = storyContext.graph.activeScene;
  const pendingDraftsText = room.assetDrafts
    .map((draft, index) =>
      [
        `# draft ${index + 1}`,
        draft.sceneMemories
          .map((memory) => `scene-memory\nvisibility: ${memory.visibility}\n${memory.note}`)
          .join("\n"),
        draft.characterMemories
          .map((memory) => {
            const characterName =
              characters.find((character) => character.id === memory.characterId)?.name ?? memory.characterId;
            return `memory: ${characterName}\nvisibility: ${memory.visibility}\n${memory.note}`;
          })
          .join("\n"),
        draft.lorebookEntries.map((entry) => `lore: ${entry.title}\n${entry.content}`).join("\n"),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return [
    "<output_schema>",
    [
      "{",
      '"sceneMemories":[{"note":"当前场景/节点需要长期记住的事实","visibility":"public|hidden|director","secretId":"可选稳定秘密 id"}],',
      '"characterMemories":[{"characterId":"角色 id","note":"这个角色需要长期记住的事实","visibility":"public|hidden|character","secretId":"可选稳定秘密 id","revealToCharacterIds":["可选角色 id"]}],',
      '"lorebookEntries":[{"title":"设定名","content":"稳定世界设定","keywords":["关键词"],"alwaysOn":false}]',
      "}",
    ].join(""),
    "</output_schema>",
    "",
    "<rules>",
    "只提取已经在本轮对话中明确发生、达成、暴露或被用户确认的稳定信息。",
    "引用文件只作为背景核对；除非本轮对话明确采用或确认，不要把引用文件内容单独沉淀为资产。",
    "不要把气氛描写、一次性寒暄、推测、模型自我解释写入资产。",
    "不要重复已有世界书、待确认草稿或角色记忆中已经包含的信息。",
    "sceneMemories 用于当前场景/节点实例的长期事实：public=已公开场景事实；hidden=暂不公开的场景秘密；director=只给导演使用的伏笔/真相。",
    "sceneMemories.hidden 应提供稳定 secretId；sceneMemories.public/director 一般不要提供 secretId。",
    "characterId 必须来自角色列表。",
    "characterMemories.visibility 必须填写：public=角色长期公开记忆；hidden=秘密/身份/暗号/动机等暂不公开；character=只对 revealToCharacterIds 指定角色可见。",
    "hidden 或 character 记忆应提供稳定 secretId，例如 secret-rooftop-code；public 记忆不要提供 secretId。",
    "revealToCharacterIds 只能使用角色列表中的 id；visibility 不是 character 时输出空数组。",
    "如果没有值得沉淀的信息，三个数组都输出空数组。",
    "只输出严格合法 JSON 对象，不要输出 Markdown、代码块或解释。",
    "</rules>",
    "",
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
      ? `<manual_room_memory>\n${storyContext.memory.manual.trim()}\n</manual_room_memory>`
      : "<manual_room_memory>（无）</manual_room_memory>",
    "",
    "<character_memories>",
    characterMemoryBrief(room, characters) || "（无）",
    "</character_memories>",
    "",
    "<lorebook>",
    formatTavernStoryLorebookEntries(storyContext.world.lorebookEntries) || "（无）",
    "</lorebook>",
    "",
    "<pending_asset_drafts>",
    pendingDraftsText || "（无）",
    "</pending_asset_drafts>",
    "",
    "<characters>",
    characterBrief(room, characters),
    "</characters>",
    "",
    "<current_user_input>",
    currentUserText,
    "</current_user_input>",
    "",
    "<new_turn_to_extract>",
    formatTavernRuntimeMessagesForSummary(sourceRuntimeMessages),
    "</new_turn_to_extract>",
    "",
    "<recent_conversation_context>",
    formatTavernRuntimeMessagesForSummary(runtimeMessages),
    "</recent_conversation_context>",
  ].join("\n");
};
