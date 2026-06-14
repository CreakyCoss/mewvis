import { formatConversationForSummary } from "@/ai/agent-context";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import { runSharedRuntimeChat } from "@/features/ai/runtime";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../types";
import { tavernMessagesToRuntimeMessages } from "./prompt";

export type TavernUserReplySuggestionInput = {
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
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

const toolCallArtifactPattern =
  /<\/?(?:function_calls?|tool_calls?|invoke|tool|arguments?|antml:function_calls?)[^>]*>/i;

const cleanManagedReply = (text: string, userPersonaName: string) => {
  const cleaned = stripUserLabel(text, userPersonaName)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();

  if (
    toolCallArtifactPattern.test(cleaned) ||
    /^<[^>]+>\s*$/i.test(cleaned) ||
    /^(?:function_calls?|tool_calls?)\b/i.test(cleaned)
  ) {
    return "";
  }

  return cleaned;
};

const parseManagedReply = (text: string, userPersonaName: string) => {
  try {
    const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
    const candidates = [
      parsed.reply,
      parsed.userReply,
      parsed.user_reply,
      parsed.content,
      parsed.message,
      parsed.text,
    ];
    const reply = candidates.find((candidate) =>
      typeof candidate === "string" && candidate.trim()
    );
    if (typeof reply === "string") {
      return cleanManagedReply(reply, userPersonaName);
    }

    if (Array.isArray(parsed.replies)) {
      const firstReply = parsed.replies.find((candidate) =>
        typeof candidate === "string" && candidate.trim()
      );
      if (typeof firstReply === "string") {
        return cleanManagedReply(firstReply, userPersonaName);
      }
    }
  } catch {
    // Fall through to plain-text parsing for models that ignored the JSON schema.
  }

  const trimmed = text.trim();
  if (!trimmed || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    return "";
  }

  return cleanManagedReply(
    trimmed.split(/\n+/)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, ""))
      .find((line) => line.trim()) ?? "",
    userPersonaName,
  );
};

const createManagedReplyFallback = (room: TavernRoom) =>
  room.sceneGoal.trim()
    ? `我先顺着当前目标继续推进：${room.sceneGoal.trim().slice(0, 80)}`
    : "我先顺着眼前的线索继续追问，看看还有没有被忽略的细节。";

export const runTavernUserReplySuggestions = async ({
  runtimeAgentId,
  runtimeModel,
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
    "每条候选建议 12 到 60 个中文字符；字符串内容不要自带引号、编号或列表符号。",
    currentDraft?.trim()
      ? "已有用户草稿时，以补全、改写或延展草稿意图为主，不要完全偏离草稿。"
      : "",
    "只输出严格合法 JSON 对象，不要 Markdown、代码块或解释。",
    "</rules>",
    "",
    "<output_schema>",
    `{"replies":["候选 1","候选 2","候选 3"]}`,
    "</output_schema>",
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
    runtimeModel,
    stream: false,
    systemPrompt: [
      "你是酒馆模式的用户回复建议助手。",
      "你只为用户生成可点击发送的中文回复候选。",
      "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
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

export const runTavernManagedUserReply = async ({
  runtimeAgentId,
  runtimeModel,
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
    `以导演身份，为酒馆用户「${room.userPersonaName || "我"}」调度并生成本轮要发送的回复。`,
    "</task>",
    "",
    "<rules>",
    "reply 必须是用户可以直接发送的一句话或一小段话。",
    "reply 不可为空，也不可只输出 reason；即使信息不足，也要生成一句谨慎的追问或推进决定。",
    "reply 绝对不能包含 <function_calls>、<tool_calls>、XML/HTML 标签、工具调用、JSON 代码块或系统标记。",
    "只替用户说话，不要替酒馆角色说话，不要写角色动作，不要输出角色名加冒号。",
    "回复需要承接当前对话和场景目标，能自然推动下一轮角色回应。",
    "可以包含用户的行动决定、追问、试探或态度，但不要越过当前剧情直接解决核心谜题。",
    "建议 20 到 120 个中文字符；内容不要自带引号、编号或列表符号。",
    currentDraft?.trim()
      ? "用户输入框里的文字是托管方向提示，请吸收其意图，但不要机械照抄。"
      : "没有方向提示时，根据当前剧情自动选择最合理、最有戏剧张力的一句回复。",
    "只输出严格合法 JSON 对象，不要 Markdown、代码块或解释。",
    "</rules>",
    "",
    "<output_schema>",
    `{"reply":"用户本轮要发送的回复","reason":"可选简短调度原因"}`,
    "</output_schema>",
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
      : "",
    "",
    "<characters>",
    characterList,
    "</characters>",
    "",
    currentDraft?.trim()
      ? `<managed_direction_hint>\n${currentDraft.trim()}\n</managed_direction_hint>`
      : "",
    "",
    "<recent_conversation>",
    recentConversation || "（无）",
    "</recent_conversation>",
  ].filter(Boolean).join("\n");

  const systemPrompt = [
    "你是酒馆模式的全托管导演。",
    "你负责代用户生成下一句可发送回复，让剧情自然继续。",
    "reply 字段必须非空，且不得包含工具调用、函数调用、XML/HTML 标签或系统标记。",
    "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
  ].join("\n");

  const runManagedReplyRequest = async (content: string) => {
    const result = await runSharedRuntimeChat({
      agentId: runtimeAgentId,
      runtimeModel,
      stream: false,
      systemPrompt,
      messages: [{
        id: `tavern-managed-user-reply-${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
        metadata: null,
      }],
    });

    return parseManagedReply(result.text, room.userPersonaName);
  };

  const firstReply = await runManagedReplyRequest(prompt);
  if (firstReply) {
    return firstReply;
  }

  const retryReply = await runManagedReplyRequest([
    prompt,
    "",
    "<retry_instruction>",
    "上一次输出没有可发送的 reply。现在必须生成一个非空 reply 字符串；只输出 JSON，不要解释。",
    "</retry_instruction>",
  ].join("\n"));
  if (retryReply) {
    return retryReply;
  }

  return createManagedReplyFallback(room);
};
