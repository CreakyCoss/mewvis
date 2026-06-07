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

const buildTavernQuickContext = ({
  room,
  characters,
  messages,
}: Pick<TavernQuickSummaryInput, "room" | "characters" | "messages">) => {
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

  return [
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
};

export const runTavernQuickSummary = async ({
  runtimeAgentId,
  provider,
  model,
  room,
  characters,
  messages,
}: TavernQuickSummaryInput) => {
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
    buildTavernQuickContext({ room, characters, messages }),
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

export const runTavernQuickNovel = async ({
  runtimeAgentId,
  provider,
  model,
  room,
  characters,
  messages,
}: TavernQuickSummaryInput) => {
  const prompt = [
    "<task>",
    "使用当前酒馆内容，按小说口吻写成一段可读的正文。",
    "</task>",
    "",
    "<rules>",
    "只基于已发生的对话、房间记忆、时间线、世界书和角色设定。",
    "可以补足衔接、动作、氛围和视角过渡，但不得新增关键事实、不得推进到当前对话之后、不得替用户做新的选择。",
    "保留角色说话方式和已出现的关系张力；角色对白要自然嵌入正文，不要机械复述聊天记录。",
    "使用中文小说正文，优先第三人称有限视角或贴近现场的叙事视角。",
    "不要写总结、提纲、列表、分析说明或“以下是小说”之类的引导语。",
    "内容充足时写 800 到 1600 字；内容较少时写 400 到 800 字，不要为了篇幅编造新剧情。",
    "</rules>",
    "",
    buildTavernQuickContext({ room, characters, messages }),
  ].join("\n");

  const result = await runSharedRuntimeChat({
    agentId: runtimeAgentId,
    provider,
    model,
    stream: false,
    systemPrompt: [
      "你是酒馆模式的小说化写作助手。",
      "你的任务是把已有剧情整理成自然、有画面感的小说正文。",
      "你可以润色和重组表达，但不能续写未来剧情、不能编造关键事实、不能输出解释过程。",
    ].join("\n"),
    messages: [{
      id: `tavern-quick-novel-${crypto.randomUUID()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      metadata: null,
    }],
  });

  return result.text.trim() || "当前还没有足够内容可写成小说。";
};
