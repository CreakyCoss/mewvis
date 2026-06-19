import {
  appendReferencesToPrompt,
} from "@/features/ai/components/context-tools";
import type { RuntimeModelInput } from "@/agent-client/protocol";
import { formatTavernRuntimeMessagesForSummary } from "./conversation";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import {
  formatTavernLorebookEntries,
  formatTavernTimelineEvents,
  tavernMessagesToRuntimeMessages,
} from "./prompt";
import {
  buildTavernBridgeSystemPrompt,
} from "./bridge-session";
import {
  tavernArchivistAgentRoleId,
  tavernBridgeSessionRootDir,
} from "../core";
import { runTavernRuntimeAgent } from "./agent";

export type TavernExtractedAssetDraft = {
  sourceMessageIds: string[];
  timelineEvents: Array<{
    title: string;
    summary: string;
  }>;
  characterMemories: Array<{
    characterId: string;
    note: string;
  }>;
  lorebookEntries: Array<{
    title: string;
    content: string;
    keywords: string[];
    alwaysOn: boolean;
  }>;
};

export type RunTavernAssetExtractionInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  sourceMessages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
};

const MAX_TIMELINE_DRAFTS = 3;
const MAX_CHARACTER_MEMORY_DRAFTS = 4;
const MAX_LOREBOOK_DRAFTS = 3;

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const limitText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const normalizeKeywords = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.flatMap((item) => (
      typeof item === "string" && item.trim() ? [item.trim()] : []
    )))]
  : [];

const normalizeKey = (value: string) => value.trim().toLowerCase();

const characterBrief = (characters: TavernCharacter[]) =>
  characters.map((character) => [
    `id: ${character.id}`,
    `name: ${character.name}`,
    `description: ${character.description}`,
    character.goals ? `goals: ${character.goals}` : "",
    character.relationships ? `relationships: ${character.relationships}` : "",
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");

const parseAssetDraft = ({
  text,
  room,
  characters,
  sourceMessages,
}: {
  text: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  sourceMessages: TavernMessage[];
}): TavernExtractedAssetDraft => {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  const characterIds = new Set(characters.map((character) => character.id));
  const existingTimelineTitles = new Set([
    ...room.timelineEvents.map((event) => normalizeKey(event.title)),
    ...room.assetDrafts.flatMap((draft) =>
      draft.timelineEvents.map((event) => normalizeKey(event.title))
    ),
  ]);
  const existingLoreTitles = new Set([
    ...room.lorebookEntries.map((entry) => normalizeKey(entry.title)),
    ...room.assetDrafts.flatMap((draft) =>
      draft.lorebookEntries.map((entry) => normalizeKey(entry.title))
    ),
  ]);

  const timelineEvents = Array.isArray(parsed.timelineEvents)
    ? parsed.timelineEvents.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }

        const candidate = value as Record<string, unknown>;
        const title = typeof candidate.title === "string" ? limitText(candidate.title, 80) : "";
        const summary = typeof candidate.summary === "string" ? limitText(candidate.summary, 360) : "";
        const normalizedTitle = normalizeKey(title);
        if (!title || !summary || existingTimelineTitles.has(normalizedTitle)) {
          return [];
        }

        existingTimelineTitles.add(normalizedTitle);
        return [{ title, summary }];
      }).slice(0, MAX_TIMELINE_DRAFTS)
    : [];
  const characterMemories = Array.isArray(parsed.characterMemories)
    ? parsed.characterMemories.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }

        const candidate = value as Record<string, unknown>;
        const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
        const note = typeof candidate.note === "string" ? limitText(candidate.note, 280) : "";
        const currentMemory = room.characterMemories[characterId] ?? "";
        if (!characterIds.has(characterId) || !note || currentMemory.includes(note)) {
          return [];
        }

        return [{ characterId, note }];
      }).slice(0, MAX_CHARACTER_MEMORY_DRAFTS)
    : [];
  const lorebookEntries = Array.isArray(parsed.lorebookEntries)
    ? parsed.lorebookEntries.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }

        const candidate = value as Record<string, unknown>;
        const title = typeof candidate.title === "string" ? limitText(candidate.title, 80) : "";
        const content = typeof candidate.content === "string" ? limitText(candidate.content, 520) : "";
        const normalizedTitle = normalizeKey(title);
        if (!title || !content || existingLoreTitles.has(normalizedTitle)) {
          return [];
        }

        existingLoreTitles.add(normalizedTitle);
        return [{
          title,
          content,
          keywords: normalizeKeywords(candidate.keywords).slice(0, 8),
          alwaysOn: Boolean(candidate.alwaysOn),
        }];
      }).slice(0, MAX_LOREBOOK_DRAFTS)
    : [];

  return {
    sourceMessageIds: sourceMessages.map((message) => message.id),
    timelineEvents,
    characterMemories,
    lorebookEntries,
  };
};

export const runTavernAssetExtraction = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
  sourceMessages,
  references,
  currentUserText,
}: RunTavernAssetExtractionInput): Promise<TavernExtractedAssetDraft> => {
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
    draft.timelineEvents.map((event) => `timeline: ${event.title}\n${event.summary}`).join("\n"),
    draft.characterMemories.map((memory) => {
      const characterName = characters.find((character) => character.id === memory.characterId)?.name
        ?? memory.characterId;
      return `memory: ${characterName}\n${memory.note}`;
    }).join("\n"),
    draft.lorebookEntries.map((entry) => `lore: ${entry.title}\n${entry.content}`).join("\n"),
  ].filter(Boolean).join("\n")).join("\n\n");
  const prompt = [
    "<output_schema>",
    [
      "{",
      "\"timelineEvents\":[{\"title\":\"事件标题\",\"summary\":\"发生了什么以及影响\"}],",
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
    "不要重复已有时间线、已有世界书、待确认草稿或角色记忆中已经包含的信息。",
    "characterId 必须来自角色列表。",
    "如果没有值得沉淀的信息，三个数组都输出空数组。",
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
    "<story_timeline>",
    formatTavernTimelineEvents(room) || "（无）",
    "</story_timeline>",
    "",
    "<character_memories>",
    Object.entries(room.characterMemories)
      .map(([characterId, memory]) => {
        const characterName = characters.find((character) => character.id === characterId)?.name ?? characterId;
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
    characterBrief(characters),
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
  const result = await runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room.id),
    agentRoleId: tavernArchivistAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请整理本轮酒馆对话中值得沉淀的剧情资产，并只输出严格合法 JSON。",
    requestContext: appendReferencesToPrompt(prompt, references),
    runtimeInstruction: [
      "你是酒馆模式的剧情资产整理员。",
      "你的任务是把新一轮对话中值得长期保存的信息整理成待确认草稿。",
      "你只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
    ].join("\n"),
  });

  try {
    return parseAssetDraft({
      text: result.text,
      room,
      characters,
      sourceMessages,
    });
  } catch {
    return {
      sourceMessageIds: sourceMessages.map((message) => message.id),
      timelineEvents: [],
      characterMemories: [],
      lorebookEntries: [],
    };
  }
};
