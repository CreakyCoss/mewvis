import {
  appendReferencesToPrompt,
  formatConversationForSummary,
} from "@/ai/context";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import { runSharedRuntimeChat } from "@/features/ai/runtime";
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
  runtimeModel: RuntimeModelInput;
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
  runtimeModel,
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
    "除非没有可用角色，否则 speakerIds 不得为空。",
    `每轮自主选择 1 到 ${maxSpeakers} 个角色，不要为了凑人数而加入无必要发言者。`,
    "普通承接轮次优先选择 1-2 个角色；冲突、会议、多人相关场景可选择 3 个角色。",
    "优先选择最能推进场景目标、回应用户、制造承接关系的角色。",
    "narrator 只能写已发生状态、环境过渡或镜头提示，不要新增关键事实、行动结果或替角色做决定；可为空，建议 40 字内。",
    "如果已经输出 narrator，后续 speakerIds 应选择会对旁白产生角色回应的人；不要安排角色复述 narrator。",
    "输出必须是严格合法 JSON 对象，以 { 开头，以 } 结尾；不要代码块。",
    "</constraints>",
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
    runtimeModel,
    stream: false,
    systemPrompt: [
      "你是酒馆模式的导演 Agent。",
      "你的职责是根据用户输入、场景目标、剧情时间线和角色状态，决定下一轮谁应该发言。",
      "可以插入一条简短旁白来做环境过渡，但不要新增关键事实，不要代替角色行动或长篇发言。",
      "只输出严格合法 JSON，不要输出 Markdown、代码块或解释。",
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
