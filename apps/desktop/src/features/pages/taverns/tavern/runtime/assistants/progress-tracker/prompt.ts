import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
} from "../../../message";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../../types";
import {
  buildTavernStoryContextPackage,
  formatTavernStoryGraphContext,
  formatTavernStoryLorebookEntries,
  selectTavernStoryLorebookEntries,
} from "../../../adapters/story";

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

export const buildTavernProgressTrackingPrompt = ({
  room,
  characters,
  messages,
  sourceMessages,
  currentUserText,
  storyContext: inputStoryContext,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  sourceMessages: TavernMessage[];
  currentUserText: string;
  storyContext?: TavernStoryContextPackage;
}) => {
  const storyContext = inputStoryContext ?? buildTavernStoryContextPackage({ room, characters });
  const activeScene = storyContext.graph.activeScene;
  const lorebookText = formatTavernStoryLorebookEntries(selectTavernStoryLorebookEntries({
    storyContext,
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

  return [
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
    storyContext.story.outline.trim() || storyContext.story.goal.trim()
      ? `<story_arc>\n${[
          storyContext.story.outline.trim(),
          storyContext.story.goal.trim() ? `终局目标：${storyContext.story.goal.trim()}` : "",
        ].filter(Boolean).join("\n\n")}\n</story_arc>`
      : "<story_arc>（无）</story_arc>",
    "",
    `<room title="${storyContext.story.title}">`,
    activeScene?.scene ?? "",
    "</room>",
    "",
    activeScene?.goal.trim()
      ? `<scene_goal>\n${activeScene.goal.trim()}\n</scene_goal>`
      : "<scene_goal>（无）</scene_goal>",
    "",
    "<story_graph>",
    formatTavernStoryGraphContext(storyContext, { maxEdges: 8, maxSummaryChars: 220 }) || "（无）",
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
};
