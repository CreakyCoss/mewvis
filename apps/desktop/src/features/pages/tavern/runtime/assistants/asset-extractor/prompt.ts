import { formatTavernRuntimeMessagesForSummary } from "../../conversation";
import {
  formatTavernLorebookEntries,
  tavernMessagesToRuntimeMessages,
} from "../../prompt";
import { formatTavernCharacterRelationships } from "../../../core";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";

const characterBrief = (room: TavernRoom, characters: TavernCharacter[]) =>
  characters.map((character) => [
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
        statusSnapshot: room.statusSnapshot,
      });
      return relationships ? `relationships: ${relationships}` : "";
    })(),
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");

export const buildTavernAssetExtractionPrompt = ({
  room,
  characters,
  messages,
  sourceMessages,
  currentUserText,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  sourceMessages: TavernMessage[];
  currentUserText: string;
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
  const pendingDraftsText = room.assetDrafts.map((draft, index) => [
    `# draft ${index + 1}`,
    draft.characterMemories.map((memory) => {
      const characterName = characters.find((character) =>
        character.id === memory.characterId
      )?.name ?? memory.characterId;
      return `memory: ${characterName}\n${memory.note}`;
    }).join("\n"),
    draft.lorebookEntries.map((entry) => `lore: ${entry.title}\n${entry.content}`).join("\n"),
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    "<output_schema>",
    [
      "{",
      "\"characterMemories\":[{\"characterId\":\"角色 id\",\"note\":\"这个角色需要长期记住的事实\"}],",
      "\"lorebookEntries\":[{\"title\":\"设定名\",\"content\":\"稳定世界设定\",\"keywords\":[\"关键词\"],\"alwaysOn\":false}]",
      "}",
    ].join(""),
    "</output_schema>",
    "",
    "<rules>",
    "只提取已经在本轮对话中明确发生、达成、暴露或被用户确认的稳定信息。",
    "引用文件只作为背景核对；除非本轮对话明确采用或确认，不要把引用文件内容单独沉淀为资产。",
    "不要把气氛描写、一次性寒暄、推测、模型自我解释写入资产。",
    "不要重复已有世界书、待确认草稿或角色记忆中已经包含的信息。",
    "characterId 必须来自角色列表。",
    "如果没有值得沉淀的信息，两个数组都输出空数组。",
    "只输出严格合法 JSON 对象，不要输出 Markdown、代码块或解释。",
    "</rules>",
    "",
    room.storyOutline.trim() || room.storyGoal.trim()
      ? `<story_arc>\n${[
          room.storyOutline.trim(),
          room.storyGoal.trim() ? `终局目标：${room.storyGoal.trim()}` : "",
        ].filter(Boolean).join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${room.title}">`,
    room.scene,
    "</room>",
    "",
    room.scenePlot.trim()
      ? `<scene_plot>\n${room.scenePlot.trim()}\n</scene_plot>`
      : "<scene_plot>（无）</scene_plot>",
    "",
    room.sceneGoal.trim()
      ? `<scene_goal>\n${room.sceneGoal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    room.sceneDirection.trim()
      ? `<scene_direction>\n${room.sceneDirection.trim()}\n</scene_direction>`
      : "<scene_direction>（无）</scene_direction>",
    "",
    room.sceneTransition.trim()
      ? `<scene_transition>\n${room.sceneTransition.trim()}\n</scene_transition>`
      : "<scene_transition>（无）</scene_transition>",
    "",
    room.memory.trim()
      ? `<manual_room_memory>\n${room.memory.trim()}\n</manual_room_memory>`
      : "<manual_room_memory>（无）</manual_room_memory>",
    "",
    "<character_memories>",
    Object.entries(room.characterMemories)
      .map(([characterId, memory]) => {
        const characterName = characters.find((character) =>
          character.id === characterId
        )?.name ?? characterId;
        return memory.trim() ? `## ${characterName}\n${memory.trim()}` : "";
      })
      .filter(Boolean)
      .join("\n\n") || "（无）",
    "</character_memories>",
    "",
    "<lorebook>",
    formatTavernLorebookEntries(room.lorebookEntries) || "（无）",
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
