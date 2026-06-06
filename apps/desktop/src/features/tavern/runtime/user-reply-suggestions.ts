import { formatConversationForSummary } from "@/ai/agent-context";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { runSharedRuntimeChat } from "@/features/shared-chat-runtime";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../types";
import { tavernMessagesToRuntimeMessages } from "./prompt";

export type TavernUserReplySuggestionInput = {
  runtimeAgentId: string;
  provider: LlmProvider;
  model: ProviderModel;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentDraft?: string;
};

const SUGGESTION_COUNT = 3;
const RECENT_MESSAGE_LIMIT = 12;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const stripUserLabel = (text: string, userPersonaName: string) => {
  const labels = [userPersonaName, "我", "用户", "玩家"]
    .map((label) => label.trim())
    .filter(Boolean)
    .map(escapeRegExp)
    .join("|");
  if (!labels) {
    return text.trim();
  }

  return text.replace(new RegExp(`^\\s*(?:${labels})\\s*[:：]\\s*`), "").trim();
};

const parseSuggestions = (text: string) => {
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    if (Array.isArray(parsed.replies)) {
      return parsed.replies.flatMap((item) =>
        typeof item === "string" ? [item] : []
      );
    }
  } catch {
    // Fall through to the line parser for models that ignored the JSON instruction.
  }

  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, ""));
};

export const runTavernUserReplySuggestions = async ({
  runtimeAgentId,
  provider,
  model,
  room,
  characters,
  messages,
  currentDraft,
}: TavernUserReplySuggestionInput) => {
  const runtimeMessages = tavernMessagesToRuntimeMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const recentConversation = formatConversationForSummary(
    runtimeMessages.slice(-RECENT_MESSAGE_LIMIT),
  );
  const characterList = characters.map((character) =>
    `${character.name}: ${character.description}`
  ).join("\n");
  const prompt = [
    "<task>",
    `为酒馆用户「${room.userPersonaName || "我"}」生成 ${SUGGESTION_COUNT} 个下一句回复候选。`,
    "</task>",
    "",
    "<rules>",
    "候选必须是用户可以直接发送的一句话或一小段话。",
    "不要替角色说话，不要写角色动作，不要输出角色名加冒号。",
    "每个候选都要能推动当前场景，但风格可以不同：追问、试探、行动决定。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "</rules>",
    "",
    "<output_schema>",
    `{"replies":["候选 1","候选 2","候选 3"]}`,
    "</output_schema>",
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
      : "",
    "",
    "<characters>",
    characterList,
    "</characters>",
    "",
    currentDraft?.trim()
      ? `<current_user_draft>\n${currentDraft.trim()}\n</current_user_draft>`
      : "",
    "",
    "<recent_conversation>",
    recentConversation || "（无）",
    "</recent_conversation>",
  ].filter(Boolean).join("\n");

  const result = await runSharedRuntimeChat({
    agentId: runtimeAgentId,
    provider,
    model,
    stream: false,
    systemPrompt: [
      "你是酒馆模式的用户回复建议助手。",
      "你只为用户生成可点击发送的中文回复候选。",
      "只输出符合 schema 的 JSON。",
    ].join("\n"),
    messages: [{
      id: `tavern-user-reply-suggestions-${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      metadata: null,
    }],
  });

  return [
    ...new Set(parseSuggestions(result.text)
      .map((item) => stripUserLabel(item, room.userPersonaName))
      .map((item) => item.replace(/^["“”]+|["“”]+$/g, "").trim())
      .filter(Boolean)),
  ].slice(0, SUGGESTION_COUNT);
};
