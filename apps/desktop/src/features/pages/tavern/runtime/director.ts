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
  selectTavernLorebookEntries,
  tavernMessagesToRuntimeMessages,
} from "./prompt";
import {
  buildTavernBridgeSystemPrompt,
} from "./bridge-session";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
  tavernBridgeSessionRootDir,
  tavernDirectorAgentRoleId,
} from "../core";
import { runTavernRuntimeAgent } from "./agent";

export type TavernDirectorDecision = {
  speakerIds: string[];
  narrator?: string;
  ambientActions?: Array<{
    characterId: string;
    action: string;
  }>;
  reason?: string;
};

export type RunTavernDirectorInput = {
  workspacePath: string;
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
const limitDirectorText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const unescapeLooseJsonString = (value: string) =>
  value
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\")
    .trim();

const extractLooseJsonStringArray = (text: string, fieldName: string) => {
  const fieldPattern = new RegExp(
    `"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`,
    "i",
  );
  const fieldMatch = fieldPattern.exec(text);
  if (!fieldMatch) {
    return [];
  }

  return [...(fieldMatch[1] ?? "").matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
    .map((match) => unescapeLooseJsonString(match[1] ?? ""))
    .filter(Boolean);
};

const extractLooseJsonStringField = (text: string, fieldName: string) => {
  const fieldPattern = new RegExp(
    `"${fieldName}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?=,\\s*"(?:speakerIds|narrator|reason)"\\s*:|\\s*}\\s*$)`,
    "i",
  );
  const fieldMatch = fieldPattern.exec(text);

  return fieldMatch ? unescapeLooseJsonString(fieldMatch[1] ?? "") : "";
};

const parseDirectorDecision = (
  text: string,
  characters: TavernCharacter[],
  maxSpeakers: number,
): TavernDirectorDecision => {
  const characterIds = new Set(characters.map((character) => character.id));
  const characterNameById = new Map(characters.map((character) => [character.id, character.name]));
  const jsonText = extractJsonObject(text);
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const parsedSpeakerIds: unknown[] | null = Array.isArray(parsed?.speakerIds)
    ? parsed.speakerIds
    : null;
  const speakerIds: string[] = parsedSpeakerIds
    ? parsedSpeakerIds
        .flatMap((value: unknown) => typeof value === "string" ? [value] : [])
        .filter((id) => characterIds.has(id))
    : extractLooseJsonStringArray(jsonText, "speakerIds")
        .filter((id) => characterIds.has(id));
  const uniqueSpeakerIds = [...new Set(speakerIds)].slice(0, maxSpeakers);
  const speakerIdSet = new Set(uniqueSpeakerIds);
  const narrator = typeof parsed?.narrator === "string"
    ? limitDirectorText(parsed.narrator, 280)
    : limitDirectorText(extractLooseJsonStringField(jsonText, "narrator"), 280);
  const reason = typeof parsed?.reason === "string"
    ? limitDirectorText(parsed.reason, 180)
    : limitDirectorText(extractLooseJsonStringField(jsonText, "reason"), 180);
  const ambientActions = Array.isArray(parsed?.ambientActions)
    ? parsed.ambientActions.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return [];
        }
        const record = candidate as Record<string, unknown>;
        const characterId = typeof record.characterId === "string" ? record.characterId.trim() : "";
        const rawAction = typeof record.action === "string" ? record.action.trim() : "";
        const characterName = characterNameById.get(characterId);
        if (
          !characterIds.has(characterId) ||
          speakerIdSet.has(characterId) ||
          !characterName ||
          !rawAction
        ) {
          return [];
        }
        const action = rawAction.includes(characterName)
          ? rawAction
          : `${characterName}${rawAction.replace(/^他(?:们)?|^她(?:们)?|^它(?:们)?/, "")}`;

        return [{
          characterId,
          action: limitDirectorText(action.replace(/^[*_\s]+|[*_\s]+$/g, ""), 120),
        }];
      }).slice(0, 2)
    : [];

  return {
    speakerIds: uniqueSpeakerIds,
    narrator: narrator || undefined,
    ambientActions,
    reason: reason || undefined,
  };
};

export const runTavernDirector = async ({
  workspacePath,
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
  const ambientActionMax = Math.min(2, Math.max(0, characters.length - 1));
  const directorPrompt = [
    "<output_schema>",
    `{"speakerIds":["character-id"],"ambientActions":[{"characterId":"未发言角色 id","action":"一句可观察动作"}],"narrator":"可选旁白","reason":"可选简短原因"}`,
    "</output_schema>",
    "",
    `<constraints maxSpeakers="${maxSpeakers}">`,
    "speakerIds 只能使用下方角色 id；如果需要多人发言，按发言顺序排列。",
    "speakerIds 是本轮角色调用计划，不是氛围描述；只要 characters 非空，speakerIds 必须至少包含 1 个角色 id。",
    "不要用空数组表示沉默、留白、等待或用户要求少说；这种情况选择 1 个最相关角色进行一句短回应。",
    "当用户输入是“嗯”“好”“继续”等短确认时，也必须选择 1 个角色承接当前岗位状态，不要返回 []。",
    `每轮自主选择 1 到 ${maxSpeakers} 个角色，不要为了凑人数而加入无必要发言者。`,
    `如果用户明确点名多个角色发言或给出发言顺序，在 ${maxSpeakers} 人上限内优先按用户点名安排。`,
    `普通承接轮次优先选择 1-2 个角色；冲突、会议、多人相关场景可选择最多 ${maxSpeakers} 个角色。`,
    "优先选择最能推进场景目标、回应用户、制造承接关系的角色。",
    `ambientActions 可选，最多 ${ambientActionMax} 条，只能选择未出现在 speakerIds 里的角色；只写可被观察到的动作/状态，不写对白、心理、意图或新剧情结果。`,
    "ambientActions 用来让未发言角色保持在场感，例如“莉娜把托盘放回吧台”“莫尔侧身让开门口”；不要为了凑数而生成。",
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
    formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-DIRECTOR_RECENT_MESSAGE_LIMIT)),
    "</recent_conversation>",
    "",
    "<public_visible_messages>",
    formatTavernVisibleMessagesForRequestContext(
      normalizeTavernMessagesForAudience({
        messages,
        characters,
        userPersonaName: room.userPersonaName,
        audience: { type: "director" },
      }).slice(-DIRECTOR_RECENT_MESSAGE_LIMIT),
    ) || "（无）",
    "</public_visible_messages>",
  ].join("\n");
  const result = await runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room.id),
    agentRoleId: tavernDirectorAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请决定本轮酒馆对话的发言顺序和可选在场动作，并只输出严格合法 JSON。",
    requestContext: appendReferencesToPrompt(directorPrompt, references),
    runtimeInstruction: [
      "你是酒馆模式的导演 Agent。",
      "你的职责是根据用户输入、场景目标、剧情时间线和角色状态，决定下一轮谁应该发言。",
      "可以插入一条简短旁白来做环境过渡，但不要新增关键事实，不要代替角色行动或长篇发言。",
      "ambientActions 只用于未发言角色的公开可观察动作，不是角色对白，也不要写心理。",
      "只要有可用角色，就必须返回至少一个 speakerId；不要用空 speakerIds 表达沉默。",
      "JSON 字符串内不要使用未转义英文双引号；引用用户短句时改用中文引号。",
      "只输出严格合法 JSON，不要输出 Markdown、代码块或解释。",
    ].join("\n"),
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
