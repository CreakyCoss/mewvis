import {
  appendReferencesToPrompt,
  formatConversationForSummary,
} from "@/ai/agent-context";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { runSharedRuntimeChat } from "@/features/shared-chat-runtime";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import {
  formatTavernLorebookEntries,
  formatTavernTimelineEvents,
  selectTavernLorebookEntries,
  tavernMessagesToRuntimeMessages,
} from "./prompt";

export type TavernDirectorDecision = {
  speakerIds: string[];
  narrator?: string;
  reason?: string;
};

export type RunTavernDirectorInput = {
  runtimeAgentId: string;
  provider: LlmProvider;
  model: ProviderModel;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  maxSpeakers?: number;
};

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const DIRECTOR_RECENT_MESSAGE_LIMIT = 10;
const TAVERN_DIRECTOR_REFERENCE_PROMPT_LIMITS = {
  perFileChars: 2400,
  totalChars: 4800,
} as const;

const limitDirectorText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const parseDirectorDecision = (
  text: string,
  characters: TavernCharacter[],
  maxSpeakers: number,
): TavernDirectorDecision => {
  const characterIds = new Set(characters.map((character) => character.id));
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  const speakerIds = Array.isArray(parsed.speakerIds)
    ? parsed.speakerIds
        .flatMap((value) => typeof value === "string" ? [value] : [])
        .filter((id) => characterIds.has(id))
    : [];
  const uniqueSpeakerIds = [...new Set(speakerIds)].slice(0, maxSpeakers);
  const narrator = typeof parsed.narrator === "string"
    ? limitDirectorText(parsed.narrator, 280)
    : "";
  const reason = typeof parsed.reason === "string"
    ? limitDirectorText(parsed.reason, 180)
    : "";

  return {
    speakerIds: uniqueSpeakerIds,
    narrator: narrator || undefined,
    reason: reason || undefined,
  };
};

export const runTavernDirector = async ({
  runtimeAgentId,
  provider,
  model,
  room,
  characters,
  messages,
  references,
  currentUserText,
  maxSpeakers = 3,
}: RunTavernDirectorInput): Promise<TavernDirectorDecision> => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
    room,
    characters,
    currentUserText,
  }));
  const characterList = characters.map((character) => [
    `id: ${character.id}`,
    `name: ${character.name}`,
    `description: ${character.description}`,
    character.goals ? `goals: ${character.goals}` : "",
    character.relationships ? `relationships: ${character.relationships}` : "",
    room.characterMemories[character.id]?.trim()
      ? `memory: ${room.characterMemories[character.id]?.trim()}`
      : "",
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
  const directorPrompt = [
    "<output_schema>",
    `{"speakerIds":["character-id"],"narrator":"可选旁白","reason":"可选简短原因"}`,
    "</output_schema>",
    "",
    `<constraints maxSpeakers="${maxSpeakers}">`,
    "speakerIds 只能使用下方角色 id；如果需要多人发言，按发言顺序排列。",
    `每轮自主选择 1 到 ${maxSpeakers} 个角色，不要为了凑人数而加入无必要发言者。`,
    "普通承接轮次优先选择 1-2 个角色；冲突、会议、多人相关场景可选择 3 个角色。",
    "优先选择最能推进场景目标、回应用户、制造承接关系的角色。",
    "narrator 必须很短，可为空。",
    "</constraints>",
    "",
    `<room title="${room.title}">`,
    room.scene,
    "</room>",
    "",
    room.sceneGoal.trim()
      ? `<scene_goal>\n${room.sceneGoal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    room.autoMemory.trim()
      ? `<auto_memory>\n${room.autoMemory.trim()}\n</auto_memory>`
      : "<auto_memory>（无）</auto_memory>",
    "",
    "<story_timeline>",
    formatTavernTimelineEvents(room) || "（无）",
    "</story_timeline>",
    "",
    "<lorebook>",
    lorebookText || "（无）",
    "</lorebook>",
    "",
    "<characters>",
    characterList,
    "</characters>",
    "",
    "<current_user_input>",
    currentUserText,
    "</current_user_input>",
    "",
    "<recent_conversation>",
    formatConversationForSummary(runtimeMessages.slice(-DIRECTOR_RECENT_MESSAGE_LIMIT)),
    "</recent_conversation>",
  ].join("\n");
  const result = await runSharedRuntimeChat({
    agentId: runtimeAgentId,
    provider,
    model,
    stream: false,
    systemPrompt: [
      "你是酒馆模式的导演 Agent。",
      "你的职责是根据用户输入、场景目标、剧情时间线和角色状态，决定下一轮谁应该发言。",
      "可以插入一条简短旁白来推进环境或转场，但不要代替角色长篇发言。",
      "只输出 JSON，不要输出 Markdown，不要解释。",
    ].join("\n"),
    messages: [{
      id: `tavern-director-${Date.now()}`,
      role: "user",
      content: appendReferencesToPrompt(directorPrompt, references, {
        query: currentUserText,
        ...TAVERN_DIRECTOR_REFERENCE_PROMPT_LIMITS,
      }),
      timestamp: Date.now(),
      metadata: null,
    }],
  });

  try {
    return parseDirectorDecision(result.text, characters, maxSpeakers);
  } catch {
    return {
      speakerIds: [],
      narrator: undefined,
      reason: undefined,
    };
  }
};
