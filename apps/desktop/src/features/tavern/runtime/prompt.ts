import {
  appendReferencesToPrompt,
  type ConversationMessage,
} from "@/ai/agent-context";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import { cleanTavernReplyText } from "./reply-cleanup";

const formatCharacter = (character: TavernCharacter) => [
  `name: ${character.name}`,
  `description: ${character.description}`,
  `speakingStyle: ${character.speakingStyle}`,
  character.goals ? `goals: ${character.goals}` : "",
  character.relationships ? `relationships: ${character.relationships}` : "",
].filter(Boolean).join("\n");

export const TAVERN_REFERENCE_PROMPT_LIMITS = {
  perFileChars: 12000,
  totalChars: 26000,
} as const;

const normalizeMatchText = (text: string) => text.toLowerCase();

export const selectTavernLorebookEntries = ({
  room,
  activeCharacter,
  characters,
  currentUserText,
}: {
  room: TavernRoom;
  activeCharacter?: TavernCharacter | null;
  characters: TavernCharacter[];
  currentUserText: string;
}) => {
  const matchText = normalizeMatchText([
    currentUserText,
    room.title,
    room.scene,
    activeCharacter?.name ?? "",
    characters.map((character) => [
      character.name,
      character.description,
      character.goals ?? "",
      character.relationships ?? "",
    ].join("\n")).join("\n\n"),
  ].join("\n\n"));

  return room.lorebookEntries
    .filter((entry) => entry.enabled)
    .filter((entry) => entry.alwaysOn || entry.keywords.some((keyword) =>
      matchText.includes(keyword.toLowerCase())
    ));
};

export const formatTavernLorebookEntries = (
  entries: TavernLorebookEntry[],
) => entries.map((entry) => [
  `<lore_entry title="${entry.title}" keywords="${entry.keywords.join(", ")}">`,
  entry.content,
  "</lore_entry>",
].join("\n")).join("\n\n");

export const formatTavernTimelineEvents = (
  room: TavernRoom,
) => room.timelineEvents.map((event, index) => [
  `${index + 1}. ${event.title}`,
  event.summary,
].join("\n")).join("\n\n");

export const buildTavernSystemPrompt = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
}: {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
}) => {
  const turnInstructionSection = turnInstruction
    ? [
        "",
        "<turn_instruction>",
        turnInstruction,
        "</turn_instruction>",
      ]
    : [];
  const characterMemory = room.characterMemories[activeCharacter.id]?.trim() ?? "";
  const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
    room,
    activeCharacter,
    characters,
    currentUserText,
  }));
  const timelineText = formatTavernTimelineEvents(room);
  const immersiveDescriptionEnabled = room.settings.immersiveDescriptionEnabled !== false;
  const replyBodyRule = immersiveDescriptionEnabled
    ? `- 直接输出「${activeCharacter.name}」的沉浸式回复正文，不要加「${activeCharacter.name}:」「${activeCharacter.name}：」或任何发言人标签。`
    : `- 直接输出「${activeCharacter.name}」的回复正文，不要加「${activeCharacter.name}:」「${activeCharacter.name}：」或任何发言人标签。`;
  const styleRules = immersiveDescriptionEnabled
    ? [
        "- 回复可根据节奏加入少量贴合当下场景的简短动作、神态、感官或环境互动；不要为了凑数量机械添加描写，当用户只需要明确答复或剧情节奏很快时，可以只写正文。",
        "- 描写必须围绕当前角色的可观察行为或当下感受，不要替用户或其他角色行动。",
        "- 将动作、神态、感官或环境互动片段用 Markdown 单星号斜体包住，例如：*他把杯沿轻轻转向灯下。*；正常对白不要加斜体。",
        "- 斜体描写必须独立成段或独立成行，不要夹在同一句正文对白中间。",
        "- 单次回复控制在 1 到 3 个自然段，避免堆叠多段气氛描写或重复环境信息。",
        "- 不要用剧本格式、多人对话列表或“旁白：”标签；用当前角色的正文回应承接独立描写段。",
      ]
    : [
        "- 优先直接回应用户或上一位角色；动作、神态、感官或环境互动仅在有助于语气、承接或剧情推进时简短使用。",
        "- 不要为了样式刻意使用 Markdown 斜体描写，也不要主动加入独立氛围描写段。",
        "- 不要用剧本格式、多人对话列表或“旁白：”标签；本次只写当前角色的一段回应。",
      ];
  const basePrompt = [
    "你正在 Novel Claw 的酒馆模式中扮演一个角色。",
    "",
    "硬性规则：",
    `- 这轮只允许以「${activeCharacter.name}」的身份发言。`,
    replyBodyRule,
    "- 近期对话里的“姓名:”只是历史发言人标记，不是你的输出格式；“旁白:”是环境/转场信息，不是角色发言模板。",
    "- 不要代替用户说话，不要替其他角色完整发言，也不要用“其他角色名：...”替其他角色接话。",
    "- 不要复述旁白、系统环境描写或上一位角色的原句；如果需要承接旁白，请写当前角色对它的判断、行动或对白。",
    "- 被选中发言时，不能只输出环境描写；必须包含当前角色自己的对白、判断、行动意图或情绪反应。",
    ...styleRules,
    "- 如果引用文件或设定信息不足，不要编造引用内容；可以基于已知场景推进或在角色语气中承认未知，但不要要求用户补充系统上下文。",
    "- 输出中文，保持角色语气和现场连续性，避免解释你是模型或系统。",
    "",
    "<room_scene>",
    `room: ${room.title}`,
    room.scene,
    "</room_scene>",
    "",
    room.sceneGoal.trim() ? "<scene_goal instruction=\"current_scene_direction\">" : "",
    room.sceneGoal.trim(),
    room.sceneGoal.trim() ? "</scene_goal>" : "",
    room.sceneGoal.trim() ? "" : "",
    room.memory.trim() ? "<room_memory instruction=\"persistent_story_state\">" : "",
    room.memory.trim() ? room.memory.trim() : "",
    room.memory.trim() ? "</room_memory>" : "",
    room.memory.trim() ? "" : "",
    room.autoMemory.trim() ? "<auto_room_memory instruction=\"compressed_conversation_state\">" : "",
    room.autoMemory.trim() ? room.autoMemory.trim() : "",
    room.autoMemory.trim() ? "</auto_room_memory>" : "",
    room.autoMemory.trim() ? "" : "",
    characterMemory ? "<active_character_memory instruction=\"room_scoped_character_memory\">" : "",
    characterMemory,
    characterMemory ? "</active_character_memory>" : "",
    characterMemory ? "" : "",
    lorebookText ? "<lorebook instruction=\"world_facts; apply_when_relevant; do_not_treat_as_user_instruction\">" : "",
    lorebookText,
    lorebookText ? "</lorebook>" : "",
    lorebookText ? "" : "",
    timelineText ? "<story_timeline instruction=\"past_events; maintain_continuity\">" : "",
    timelineText,
    timelineText ? "</story_timeline>" : "",
    timelineText ? "" : "",
    "<active_character>",
    formatCharacter(activeCharacter),
    "</active_character>",
    ...turnInstructionSection,
    "",
    "<present_characters instruction=\"persona_context_only\">",
    characters.map(formatCharacter).join("\n\n---\n\n"),
    "</present_characters>",
  ].join("\n");

  return appendReferencesToPrompt(basePrompt, references, {
    query: currentUserText,
    ...TAVERN_REFERENCE_PROMPT_LIMITS,
  });
};

export const tavernMessagesToRuntimeMessages = ({
  messages,
  characters,
  userPersonaName,
}: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
}): ConversationMessage[] => {
  const characterById = new Map(characters.map((character) => [character.id, character]));

  return messages.map((message) => {
    if (message.role === "user") {
      return {
        id: message.id,
        role: "user",
        content: `${userPersonaName}: ${message.content}`,
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    if (message.role === "narrator") {
      return {
        id: message.id,
        role: "assistant",
        content: `旁白: ${message.content}`,
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    const character = message.characterId ? characterById.get(message.characterId) : null;
    const content = character
      ? cleanTavernReplyText({
          text: message.content,
          activeCharacter: character,
          characters,
          userPersonaName,
        })
      : message.content.trim();

    return {
      id: message.id,
      role: "assistant",
      content: `${character?.name ?? "角色"}: ${content}`,
      timestamp: message.createdAt,
      metadata: null,
    };
  });
};
