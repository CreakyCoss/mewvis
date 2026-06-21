import {
  appendReferencesToPrompt,
} from "@/features/ai/components/context-tools";
import type { RuntimeModelInput } from "@/agent-client/protocol";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
  tavernBridgeSessionRootDir,
  tavernProgressTrackerAgentRoleId,
} from "../core";
import type {
  TavernCharacter,
  TavernEntityRef,
  TavernEventIntensity,
  TavernFactEvent,
  TavernMessage,
  TavernProgressVisibility,
  TavernReferencedFile,
  TavernRoom,
} from "../types";
import {
  formatTavernLorebookEntries,
  formatTavernStoryGraphContext,
  selectTavernLorebookEntries,
} from "./prompt";
import {
  buildTavernBridgeSystemPrompt,
} from "./bridge-session";
import { runTavernRuntimeAgent } from "./agent";

export type RunTavernProgressTrackingInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  sourceMessages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnId: string;
};

const EVENT_INTENSITIES = new Set<TavernEventIntensity>([
  "trivial",
  "minor",
  "moderate",
  "major",
  "critical",
]);

const FACT_VISIBILITIES = new Set<TavernProgressVisibility>([
  "public",
  "owner",
  "team",
  "private",
  "director",
  "hidden",
  "debug",
]);

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? "{}";
};

const clampConfidence = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
};

const normalizeEntityRef = (
  value: unknown,
  characterIds: Set<string>,
): TavernEntityRef | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "user") {
    return { type: "user", userId: "user" };
  }
  if (candidate.type === "character") {
    const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
    return characterIds.has(characterId) ? { type: "character", characterId } : undefined;
  }
  if (candidate.type === "global") {
    return { type: "global" };
  }
  if (candidate.type === "scene") {
    const sceneId = typeof candidate.sceneId === "string" && candidate.sceneId.trim()
      ? candidate.sceneId.trim()
      : undefined;
    return sceneId ? { type: "scene", sceneId } : { type: "scene", sceneId: "current" };
  }
  if (candidate.type === "party") {
    const partyId = typeof candidate.partyId === "string" ? candidate.partyId.trim() : "";
    return partyId ? { type: "party", partyId } : undefined;
  }
  if (candidate.type === "team") {
    const teamId = typeof candidate.teamId === "string" ? candidate.teamId.trim() : "";
    return teamId ? { type: "team", teamId } : undefined;
  }
  if (candidate.type === "faction") {
    const factionId = typeof candidate.factionId === "string" ? candidate.factionId.trim() : "";
    return factionId ? { type: "faction", factionId } : undefined;
  }
  return undefined;
};

const normalizeStringArray = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
  : [];

const normalizeFactVisibility = (
  value: unknown,
  fallback: TavernProgressVisibility,
) => typeof value === "string" && FACT_VISIBILITIES.has(value as TavernProgressVisibility)
  ? value as TavernProgressVisibility
  : fallback;

const normalizeFactRevealWhen = (value: unknown) =>
  value === "sceneOutcome" || value === "never" || value === "manual"
    ? value
    : undefined;

const formatAllowedEvents = (room: TavernRoom) => {
  const lines = room.statusRules.map((rule) => {
    const definition = room.statusDefinitions.find((status) => status.id === rule.apply.statusId);
    return [
      `eventType: ${rule.when.eventType}`,
      `status: ${definition?.label ?? rule.apply.statusId} (${rule.apply.statusId})`,
      `targetScope: ${rule.when.targetScope}`,
      `targetMode: ${rule.apply.target ?? "eventTarget"}`,
      `value: ${rule.apply.value ?? JSON.stringify(rule.apply.valueByIntensity ?? {})}`,
    ].join(" / ");
  });
  return lines.length > 0 ? lines.join("\n") : "（无）";
};

const characterBrief = (characters: TavernCharacter[]) =>
  characters.map((character) => [
    `id: ${character.id}`,
    `name: ${character.name}`,
    `description: ${character.description}`,
  ].join("\n")).join("\n\n---\n\n");

const parseFactEvents = ({
  text,
  room,
  characters,
  sourceMessages,
  turnId,
}: {
  text: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  sourceMessages: TavernMessage[];
  turnId: string;
}): TavernFactEvent[] => {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  const allowedEventTypes = new Set(room.statusRules.map((rule) => rule.when.eventType));
  const characterIds = new Set(characters.map((character) => character.id));
  const sourceMessageIds = new Set(sourceMessages.map((message) => message.id));
  const fallbackSourceMessageIds = sourceMessages.map((message) => message.id);
  const minConfidence = room.progressTracker.factConfidenceThreshold;

  return Array.isArray(parsed.factEvents)
    ? parsed.factEvents.flatMap((value, index): TavernFactEvent[] => {
        if (!value || typeof value !== "object") {
          return [];
        }

        const candidate = value as Record<string, unknown>;
        const type = typeof candidate.type === "string" ? candidate.type.trim() : "";
        if (!allowedEventTypes.has(type)) {
          return [];
        }

        const evidence = typeof candidate.evidence === "string" ? candidate.evidence.trim() : "";
        const confidence = clampConfidence(candidate.confidence);
        if (!evidence || confidence < minConfidence) {
          return [];
        }

        const actor = normalizeEntityRef(candidate.actor, characterIds);
        const target = normalizeEntityRef(candidate.target, characterIds);
        const rawIntensity = typeof candidate.intensity === "string" ? candidate.intensity.trim() : "";
        const intensity = EVENT_INTENSITIES.has(rawIntensity as TavernEventIntensity)
          ? rawIntensity as TavernEventIntensity
          : undefined;
        const valueNumber = typeof candidate.value === "number" && Number.isFinite(candidate.value)
          ? candidate.value
          : undefined;
        const candidateSourceMessageIds = Array.isArray(candidate.sourceMessageIds)
          ? candidate.sourceMessageIds.flatMap((id) => (
              typeof id === "string" && sourceMessageIds.has(id) ? [id] : []
            ))
          : [];
        const fallbackVisibility = room.settings.informationPolicy.hiddenFacts.enabled
          ? room.settings.informationPolicy.hiddenFacts.defaultVisibility
          : "public";
        const visibility = normalizeFactVisibility(candidate.visibility, fallbackVisibility);
        const visibleToUser = candidate.visibleToUser === true;
        const visibleToCharacterIds = normalizeStringArray(candidate.visibleToCharacterIds)
          .filter((characterId) => characterIds.has(characterId));
        const visibleToFactionIds = normalizeStringArray(candidate.visibleToFactionIds);
        const revealWhen = normalizeFactRevealWhen(candidate.revealWhen) ??
          (visibility === "public" ? undefined : room.settings.informationPolicy.hiddenFacts.reveal);

        return [{
          id: `${turnId}-fact-${index + 1}-${type}`,
          turnId,
          sourceMessageIds: candidateSourceMessageIds.length > 0
            ? candidateSourceMessageIds
            : fallbackSourceMessageIds,
          type,
          ...(actor ? { actor } : {}),
          ...(target ? { target } : {}),
          ...(intensity ? { intensity } : {}),
          ...(typeof valueNumber === "number" ? { value: valueNumber } : {}),
          evidence,
          confidence,
          visibility,
          ...(revealWhen ? { revealWhen } : {}),
          ...(visibleToUser ? { visibleToUser } : {}),
          ...(visibleToCharacterIds.length > 0 ? { visibleToCharacterIds } : {}),
          ...(visibleToFactionIds.length > 0 ? { visibleToFactionIds } : {}),
          createdAt: Date.now(),
        }];
      }).slice(0, 12)
    : [];
};

export const runTavernProgressTracking = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
  sourceMessages,
  references,
  currentUserText,
  turnId,
}: RunTavernProgressTrackingInput): Promise<TavernFactEvent[]> => {
  const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
    room,
    characters,
    currentUserText,
  }));
  const visibleSourceMessages = formatTavernVisibleMessagesForRequestContext(
    normalizeTavernMessagesForAudience({
      messages: sourceMessages,
      characters,
      userPersonaName: room.userPersonaName,
      audience: { type: "director" },
    }),
  );
  const visibleRecentMessages = formatTavernVisibleMessagesForRequestContext(
    normalizeTavernMessagesForAudience({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
      audience: { type: "director" },
    }).slice(-16),
  );
  const prompt = [
    "<output_schema>",
    [
      "{",
      "\"factEvents\":[{",
      "\"type\":\"damage|healing|help|betrayal|...\",",
      "\"actor\":{\"type\":\"user|character|global|scene\",\"userId\":\"user\",\"characterId\":\"角色 id\"},",
      "\"target\":{\"type\":\"character|user|global|scene\",\"characterId\":\"角色 id\"},",
      "\"intensity\":\"trivial|minor|moderate|major|critical\",",
      "\"value\":0,",
      "\"sourceMessageIds\":[\"message id\"],",
      "\"evidence\":\"本轮公开可观察证据\",",
      "\"visibility\":\"public|private|director|hidden\",",
      "\"revealWhen\":\"manual|sceneOutcome|never\",",
      "\"visibleToUser\":false,",
      "\"visibleToCharacterIds\":[\"character id\"],",
      "\"visibleToFactionIds\":[\"faction id\"],",
      "\"confidence\":0.0",
      "}]}",
    ].join(""),
    "</output_schema>",
    "",
    "<rules>",
    "只抽取本轮明确发生、被用户明确选择、或被角色公开承认的事实事件。",
    "不要根据角色心理、暗示、猜测、气氛描写或未完成意图生成事实事件。",
    "不要直接输出状态值，例如“health=70”；只能输出事件 type、actor、target、intensity/value 和证据。",
    "visibleToCharacterIds/visibleToFactionIds 只表示哪些角色的上下文可知道该事实，不表示界面公开展示。",
    "visibleToUser=true 表示用户本人可在私密情报面板或来源消息下方查看，不表示公共对话区可见。",
    "sourceMessageIds 应填写最直接产生该事实的消息 id；用户私有线索应优先锚定到暴露线索的那条消息。",
    "狼人杀、推理和悬疑场景中，身份、凶手、验人结果、真实动机、密谋信息默认不是 public。",
    "如果事实不是所有人都应知道，visibility 必须是 private/director/hidden，并填写可知角色或阵营；evidence 只写可作为记录的简短证据。",
    "actor/target 只能使用用户、角色 id、global 或 scene；角色 id 必须来自角色列表。",
    "如果事件会改变有向关系，actor 是行动者，target 是受影响者。例如用户帮助阿洛：actor=user，target=char-a。",
    "如果没有明确事件，输出 {\"factEvents\":[]}。",
    "只输出严格合法 JSON 对象，不要 Markdown、代码块或解释。",
    "</rules>",
    "",
    "<allowed_event_rules>",
    formatAllowedEvents(room),
    "</allowed_event_rules>",
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
    room.sceneGoal.trim()
      ? `<scene_goal>\n${room.sceneGoal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    "<story_graph>",
    formatTavernStoryGraphContext(room, { maxEdges: 8, maxSummaryChars: 220 }) || "（无）",
    "</story_graph>",
    "",
    "<lorebook>",
    lorebookText || "（无）",
    "</lorebook>",
    "",
    "<characters>",
    characterBrief(characters),
    "</characters>",
    "",
    "<current_user_input>",
    currentUserText,
    "</current_user_input>",
    "",
    "<new_turn_public_messages>",
    visibleSourceMessages || "（无）",
    "</new_turn_public_messages>",
    "",
    "<recent_public_context>",
    visibleRecentMessages || "（无）",
    "</recent_public_context>",
  ].join("\n");
  const result = await runTavernRuntimeAgent({
    agentId: runtimeAgentId,
    workspacePath,
    sessionRootDir: tavernBridgeSessionRootDir(room.id),
    agentRoleId: tavernProgressTrackerAgentRoleId(room),
    runtimeModel,
    systemPrompt: buildTavernBridgeSystemPrompt(room),
    userMessage: "请从本轮公开对话中抽取会驱动状态规则的事实事件，并只输出严格合法 JSON。",
    requestContext: appendReferencesToPrompt(prompt, references),
    runtimeInstruction: [
      "你是酒馆模式的状态事实抽取 Agent。",
      "你只抽取明确事实事件，不能决定状态数值，不能补设定。",
      "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
    ].join("\n"),
  });

  try {
    return parseFactEvents({
      text: result.text,
      room,
      characters,
      sourceMessages,
      turnId,
    });
  } catch {
    return [];
  }
};
