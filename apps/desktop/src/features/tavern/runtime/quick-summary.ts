import { formatConversationForSummary } from "@/ai/agent-context";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { runSharedRuntimeChat } from "@/features/shared-chat-runtime";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../types";
import {
  formatTavernLorebookEntries,
  formatTavernTimelineEvents,
  tavernMessagesToRuntimeMessages,
} from "./prompt";

export type TavernQuickSummaryInput = {
  runtimeAgentId: string;
  provider: LlmProvider;
  model: ProviderModel;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
};

const RECENT_MESSAGE_LIMIT = 80;

const characterBrief = (characters: TavernCharacter[]) =>
  characters
    .map((character) => [
      `- ${character.name}`,
      `设定：${character.description}`,
      character.goals ? `目标：${character.goals}` : "",
      character.relationships ? `关系：${character.relationships}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

const characterMemories = (
  room: TavernRoom,
  characters: TavernCharacter[],
) => Object.entries(room.characterMemories)
  .map(([characterId, memory]) => {
    const trimmed = memory.trim();
    if (!trimmed) {
      return "";
    }

    const characterName = characters.find((character) =>
      character.id === characterId
    )?.name ?? characterId;
    return `## ${characterName}\n${trimmed}`;
  })
  .filter(Boolean)
  .join("\n\n");

export const runTavernQuickSummary = async ({
  runtimeAgentId,
  provider,
  model,
  room,
  characters,
  messages,
}: TavernQuickSummaryInput) => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const recentConversation = formatConversationForSummary(
    runtimeMessages.slice(-RECENT_MESSAGE_LIMIT),
  );
  const lorebookText = formatTavernLorebookEntries(
    room.lorebookEntries.filter((entry) => entry.enabled),
  );
  const timelineText = formatTavernTimelineEvents(room);
  const characterMemoryText = characterMemories(room, characters);
  const prompt = [
    "<task>",
    "总结当前酒馆故事进展，供用户快速回到现场。",
    "</task>",
    "",
    "<rules>",
    "只基于已发生的对话、房间记忆、时间线、世界书和角色设定。",
    "不要续写剧情，不要新增事实，不要替任何角色安排新的行动。",
    "优先写清：当前局面、已经确认的线索/事实、人物状态与关系变化、未解决的问题、下一步可跟进的方向。",
    "输出中文 Markdown，使用简短小标题和列表；通常 4 到 8 条要点，内容很多时最多 10 条。",
    "如果进展很少，用 2 到 4 条说明当前只建立了哪些基础信息，不要为了凑条目重复内容。",
    "</rules>",
    "",
    `<room title="${room.title}">`,
    room.scene,
    "</room>",
    "",
    room.sceneGoal.trim()
      ? `<scene_goal>\n${room.sceneGoal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    room.memory.trim()
      ? `<manual_memory>\n${room.memory.trim()}\n</manual_memory>`
      : "<manual_memory>（无）</manual_memory>",
    "",
    room.autoMemory.trim()
      ? `<auto_memory>\n${room.autoMemory.trim()}\n</auto_memory>`
      : "<auto_memory>（无）</auto_memory>",
    "",
    "<character_memories>",
    characterMemoryText || "（无）",
    "</character_memories>",
    "",
    "<story_timeline>",
    timelineText || "（无）",
    "</story_timeline>",
    "",
    "<lorebook>",
    lorebookText || "（无）",
    "</lorebook>",
    "",
    "<characters>",
    characterBrief(characters) || "（无）",
    "</characters>",
    "",
    "<recent_conversation>",
    recentConversation || "（无）",
    "</recent_conversation>",
  ].join("\n");

  const result = await runSharedRuntimeChat({
    agentId: runtimeAgentId,
    provider,
    model,
    stream: false,
    systemPrompt: [
      "你是酒馆模式的剧情进展总结助手。",
      "你的任务是压缩已有事实，帮助用户快速理解现在发生到哪里。",
      "不要续写，不要编造，不要输出寒暄或分析过程。",
    ].join("\n"),
    messages: [{
      id: `tavern-quick-summary-${crypto.randomUUID()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      metadata: null,
    }],
  });

  return result.text.trim() || "当前还没有足够内容可总结。";
};
