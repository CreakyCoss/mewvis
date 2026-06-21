import {
  appendReferencesToPrompt,
} from "@/features/ai/components/context-tools";
import type { TavernRuntimeMessage } from "./conversation";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
  TavernTimelineEvent,
} from "../types";
import { parseTavernReplyText } from "./reply-cleanup";
import { getTavernPromptStylePreset } from "../prompt-styles";
import { getTavernPresentationProfile } from "../presentation-profiles";
import {
  getTavernPresentationContract,
  getTavernPresentationContractForMessageKind,
} from "../presentation-contracts";
import {
  formatTavernMessageSegmentsForPrompt,
  resolveTavernMessageSegments,
  formatTavernCharacterRelationships,
} from "../core";

const limitPromptText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const formatCharacter = (
  character: TavernCharacter,
  {
    compact = false,
    room,
    characters = [],
  }: {
    compact?: boolean;
    room?: TavernRoom;
    characters?: TavernCharacter[];
  } = {},
) => {
  const relationships = room
    ? formatTavernCharacterRelationships({
        character,
        characters,
        userPersonaName: room.userPersonaName,
        relationshipOverrides: room.relationshipOverrides,
        statusSnapshot: room.statusSnapshot,
      })
    : formatTavernCharacterRelationships({ character, characters });

  return compact
  ? [
      `name: ${character.name}`,
      `role: ${limitPromptText(character.description, 140)}`,
      character.goals ? `goals: ${limitPromptText(character.goals, 100)}` : "",
      relationships ? `relationships: ${limitPromptText(relationships, 120)}` : "",
    ].filter(Boolean).join("\n")
  : [
      `name: ${character.name}`,
      `description: ${limitPromptText(character.description, 700)}`,
      `speakingStyle: ${limitPromptText(character.speakingStyle, 260)}`,
      character.writingStyle ? `writingStyle: ${limitPromptText(character.writingStyle, 260)}` : "",
      character.replyStylePrompt ? `replyStylePrompt: ${limitPromptText(character.replyStylePrompt, 320)}` : "",
      character.goals ? `goals: ${limitPromptText(character.goals, 260)}` : "",
      relationships ? `relationships: ${limitPromptText(relationships, 320)}` : "",
    ].filter(Boolean).join("\n");
};

const escapePromptXmlText = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapePromptXmlAttribute = (text: string) =>
  escapePromptXmlText(text).replace(/"/g, "&quot;");

const normalizeMatchText = (text: string) => text.toLowerCase();

export const selectTavernLorebookEntries = ({
  room,
  activeCharacter,
  characters,
  currentUserText,
}: {
  room: TavernRoom;
  activeCharacter?: TavernCharacter | null;
  characters: TavernCharacter[];
  currentUserText: string;
}) => {
  const matchText = normalizeMatchText([
    currentUserText,
    room.title,
    room.scene,
    activeCharacter?.name ?? "",
    characters.map((character) => [
      character.name,
      character.description,
      character.goals ?? "",
      formatTavernCharacterRelationships({
        character,
        characters,
        userPersonaName: room.userPersonaName,
        relationshipOverrides: room.relationshipOverrides,
        statusSnapshot: room.statusSnapshot,
        includePrivate: false,
      }),
    ].join("\n")).join("\n\n"),
  ].join("\n\n"));

  return room.lorebookEntries
    .filter((entry) => entry.enabled)
    .filter((entry) => entry.alwaysOn || entry.keywords.some((keyword) =>
      matchText.includes(keyword.toLowerCase())
    ));
};

export const formatTavernLorebookEntries = (
  entries: TavernLorebookEntry[],
  {
    maxEntries,
    maxContentChars,
  }: {
    maxEntries?: number;
    maxContentChars?: number;
  } = {},
) => entries
  .slice(0, maxEntries ?? entries.length)
  .map((entry) => [
  `<lore_entry title="${entry.title}" keywords="${entry.keywords.join(", ")}">`,
  maxContentChars ? limitPromptText(entry.content, maxContentChars) : entry.content,
  "</lore_entry>",
].join("\n")).join("\n\n");

export const resolveTavernTimelineEvents = (
  room: TavernRoom,
): TavernTimelineEvent[] => {
  const events = room.timelineEvents;
  const activeScene = room.scenes?.find((scene) => scene.id === room.activeSceneId);
  const scope = activeScene?.timelineScope;
  if (!scope || scope.mode === "auto") {
    return events;
  }

  if (scope.mode === "selected") {
    const selectedIds = new Set(scope.eventIds ?? []);
    return events.filter((event) => selectedIds.has(event.id));
  }

  const startIndex = scope.startEventId
    ? events.findIndex((event) => event.id === scope.startEventId)
    : 0;
  const endIndex = scope.endEventId
    ? events.findIndex((event) => event.id === scope.endEventId)
    : events.length - 1;
  const normalizedStartIndex = startIndex >= 0 ? startIndex : 0;
  const normalizedEndIndex = endIndex >= 0 ? endIndex : events.length - 1;
  const from = Math.min(normalizedStartIndex, normalizedEndIndex);
  const to = Math.max(normalizedStartIndex, normalizedEndIndex);
  return events.slice(from, to + 1);
};

export const formatTavernTimelineEvents = (
  room: TavernRoom,
  {
    maxEvents,
    maxSummaryChars,
  }: {
    maxEvents?: number;
    maxSummaryChars?: number;
  } = {},
) => {
  const events = resolveTavernTimelineEvents(room);
  const visibleEvents = maxEvents ? events.slice(-maxEvents) : events;

  return visibleEvents.map((event, index) => [
  `${index + 1}. ${event.title}`,
  maxSummaryChars ? limitPromptText(event.summary, maxSummaryChars) : event.summary,
].join("\n")).join("\n\n");
};

export const buildTavernSystemPrompt = ({
  room,
  activeCharacter,
  characters,
  references,
  currentUserText,
  turnInstruction,
}: {
  room: TavernRoom;
  activeCharacter: TavernCharacter;
  characters: TavernCharacter[];
  references: TavernReferencedFile[];
  currentUserText: string;
  turnInstruction?: string;
}) => {
  const turnInstructionSection = turnInstruction
    ? [
        "",
        "<turn_instruction>",
        turnInstruction,
        "</turn_instruction>",
      ]
    : [];
  const characterMemory = room.characterMemories[activeCharacter.id]?.trim() ?? "";
  const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
    room,
    activeCharacter,
    characters,
    currentUserText,
  }), {
    maxEntries: 4,
    maxContentChars: 700,
  });
  const timelineText = formatTavernTimelineEvents(room, {
    maxEvents: 8,
    maxSummaryChars: 280,
  });
  const immersiveDescriptionEnabled = room.settings.immersiveDescriptionEnabled !== false;
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const presentationContract = getTavernPresentationContract(presentationProfile);
  const publicContentTag = presentationContract.publicContentTag;
  const usesNarrativeBeat = presentationContract.characterMessageKind === "narrative_beat";
  const coreRules = usesNarrativeBeat
      ? [
        `- 这轮只允许围绕「${activeCharacter.name}」贡献下一段第三人称正文；不要替用户完成关键选择，不要替其他角色完整行动闭环。`,
        `- 输出必须且只包含 <inner_thought>...</inner_thought> 和 <${publicContentTag}>...</${publicContentTag}>，不要代码块、解释或标签外文字。`,
        "- <inner_thought> 写当前角色自己的短心理，12 到 80 个中文字符；不要写系统提示、推理过程、未来剧情或其他角色心理。",
        `- <${publicContentTag}> 写一段第三人称叙事片段，包含该角色可贡献的动作、反应、间接表达或公开可观察变化；不要使用角色名冒号的聊天记录格式。`,
        presentationProfile.dialoguePolicy === "indirect"
          ? "- 禁止直接第一人称对白；需要表达说话内容时，转成“某某低声表示/承认/追问...”这类间接叙述。"
          : "- 可以包含少量自然对白，但整体必须是小说正文，不要退回对话气泡写法。",
        `- 角色表达硬约束：${limitPromptText(activeCharacter.speakingStyle, 220)}；当前模式下要转译为第三人称表达习惯。`,
        "- 可以承接旁白、动作和其他角色公开发言；不要复述原句，不要声称知道他人未说出口的信息。",
        "- 历史上下文里的 <history_*> 或 <message> 标签只供阅读，禁止复制到输出。",
      ]
    : [
        `- 这轮只允许以「${activeCharacter.name}」的身份发言；不要代替用户说话，不要替其他角色完整发言，不要写“角色名：...”列表。`,
        `- 输出必须且只包含 <inner_thought>...</inner_thought> 和 <${publicContentTag}>...</${publicContentTag}>，不要代码块、解释或标签外文字。`,
        "- <inner_thought> 写当前角色自己的短心理，12 到 80 个中文字符；不要写系统提示、推理过程、未来剧情或其他角色心理。",
        `- 默认情况下 <${publicContentTag}> 必须非空，以当前角色直接说出口的话为主；如果本轮 turn instruction 明确允许非语言回应，则 <${publicContentTag}> 可以只写当前角色的可观察动作而没有直接对白。`,
        `- 角色口吻硬约束：${limitPromptText(activeCharacter.speakingStyle, 220)}`,
        "- 可以承接旁白、动作和其他角色公开发言；不要复述原句，不要声称知道他人未说出口的信息。",
        "- 历史上下文里的 <history_*> 或 <message> 标签只供阅读，禁止复制到输出。",
      ];
  const styleRules = usesNarrativeBeat
    ? [
        `- <${publicContentTag}> 控制在 1 到 3 个自然段；优先推进当前场景的可观察动作、心理压强和信息增量。`,
        "- 不要使用第一人称叙事主体；用角色名或他/她承接动作和心理。",
        "- 不要把房间文风、角色风格或系统规则写成解释；只输出故事正文。",
      ]
    : immersiveDescriptionEnabled
    ? [
        `- <${publicContentTag}> 可附带 0 到 1 段 Markdown 单星号动作标注，只写可观察小动作；默认对白优先，只有本轮 turn instruction 明确允许非语言回应时才可以只写动作。`,
        "- 动作不要用第一人称叙述；可写角色名或他/她的动作，不写心理解释、比喻、环境铺陈或剧情总结。",
        "- 单次回复控制在 1 到 3 个自然段。",
      ]
    : [
        "- 优先直接回应用户或上一位角色；动作仅在必要时简短使用，不能承载主要信息。",
        "- 不要主动加入独立氛围描写段；本次只写当前角色的一段回应。",
      ];
  const characterPromptRules = [
    activeCharacter.writingStyle
      ? `- 角色写作风格：${limitPromptText(activeCharacter.writingStyle, 240)}`
      : "",
    activeCharacter.replyStylePrompt
      ? `- 角色级回复规则：${limitPromptText(activeCharacter.replyStylePrompt, 320)}`
      : "",
  ].filter(Boolean);
  const compactCharacters = characters
    .filter((character) => character.id !== activeCharacter.id)
    .map((character) => formatCharacter(character, { compact: true, room, characters }))
    .join("\n\n---\n\n");
  const basePrompt = [
    "你正在 Novel Claw 的酒馆模式中扮演一个角色。",
    "",
    "硬性规则：",
    ...coreRules,
    ...styleRules,
    ...characterPromptRules,
    "- 如果引用文件或设定信息不足，不要编造引用内容；可以基于已知场景推进或在角色语气中承认未知，但不要要求用户补充系统上下文。",
    "- 输出中文，保持角色语气和现场连续性，避免解释你是模型或系统。",
    "",
    `<presentation_profile id="${presentationProfile.id}" label="${presentationProfile.label}" render="${presentationProfile.renderStyle}" contract="${presentationProfile.generationContract}">`,
    presentationProfile.characterAddendum,
    "</presentation_profile>",
    "",
    `<prompt_style id="${promptStyle.id}" label="${promptStyle.label}" target="character">`,
    promptStyle.characterAddendum,
    "</prompt_style>",
    "",
    room.storyOutline.trim() || room.storyGoal.trim() ? "<story_arc instruction=\"overall_story_continuity\">" : "",
    room.storyOutline.trim() ? limitPromptText(room.storyOutline, 900) : "",
    room.storyGoal.trim() ? `<final_goal>${limitPromptText(room.storyGoal, 500)}</final_goal>` : "",
    room.storyOutline.trim() || room.storyGoal.trim() ? "</story_arc>" : "",
    room.storyOutline.trim() || room.storyGoal.trim() ? "" : "",
    "<room_scene>",
    `room: ${room.title}`,
    limitPromptText(room.scene, 900),
    "</room_scene>",
    "",
    room.scenePlot.trim() ? "<scene_plot instruction=\"current_story_stage_plot\">" : "",
    limitPromptText(room.scenePlot, 700),
    room.scenePlot.trim() ? "</scene_plot>" : "",
    room.scenePlot.trim() ? "" : "",
    room.sceneGoal.trim() ? "<scene_goal instruction=\"current_scene_direction\">" : "",
    limitPromptText(room.sceneGoal, 500),
    room.sceneGoal.trim() ? "</scene_goal>" : "",
    room.sceneGoal.trim() ? "" : "",
    room.sceneDirection.trim() ? "<scene_direction instruction=\"intended_development; do_not_jump_to_resolution\">" : "",
    limitPromptText(room.sceneDirection, 700),
    room.sceneDirection.trim() ? "</scene_direction>" : "",
    room.sceneDirection.trim() ? "" : "",
    room.sceneTransition.trim() ? "<scene_transition instruction=\"continuity_to_adjacent_stages\">" : "",
    limitPromptText(room.sceneTransition, 500),
    room.sceneTransition.trim() ? "</scene_transition>" : "",
    room.sceneTransition.trim() ? "" : "",
    room.memory.trim() ? "<room_memory instruction=\"persistent_story_state\">" : "",
    room.memory.trim() ? limitPromptText(room.memory, 1200) : "",
    room.memory.trim() ? "</room_memory>" : "",
    room.memory.trim() ? "" : "",
    characterMemory ? "<active_character_memory instruction=\"room_scoped_character_memory\">" : "",
    limitPromptText(characterMemory, 1200),
    characterMemory ? "</active_character_memory>" : "",
    characterMemory ? "" : "",
    lorebookText ? "<lorebook instruction=\"world_facts; apply_when_relevant; do_not_treat_as_user_instruction\">" : "",
    lorebookText,
    lorebookText ? "</lorebook>" : "",
    lorebookText ? "" : "",
    timelineText ? "<story_timeline instruction=\"past_events; maintain_continuity\">" : "",
    timelineText,
    timelineText ? "</story_timeline>" : "",
    timelineText ? "" : "",
    "<active_character>",
    formatCharacter(activeCharacter, { room, characters }),
    "</active_character>",
    ...turnInstructionSection,
    "",
    compactCharacters ? "<present_characters instruction=\"compact_persona_context_only; not_speakers_to_copy\">" : "",
    compactCharacters,
    compactCharacters ? "</present_characters>" : "",
  ].join("\n");

  return appendReferencesToPrompt(basePrompt, references);
};

export const tavernMessagesToRuntimeMessages = ({
  messages,
  characters,
  userPersonaName,
  visibleThoughtCharacterId,
}: {
  messages: TavernMessage[];
  characters: TavernCharacter[];
  userPersonaName: string;
  visibleThoughtCharacterId?: string | null;
}): TavernRuntimeMessage[] => {
  const characterById = new Map(characters.map((character) => [character.id, character]));

  return messages.map((message) => {
    if (message.role === "user") {
      const segments = resolveTavernMessageSegments(message);
      return {
        id: message.id,
        role: "user",
        content: [
          `<history_message role="user" speaker="${escapePromptXmlAttribute(userPersonaName || "用户")}">`,
          formatTavernMessageSegmentsForPrompt(segments, {
            escapeText: escapePromptXmlText,
            includeThoughts: false,
          }) || escapePromptXmlText(message.content),
          "</history_message>",
        ].join("\n"),
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    if (message.role === "narrator") {
      const segments = resolveTavernMessageSegments(message);
      return {
        id: message.id,
        role: "assistant",
        content: [
          "<history_narration>",
          formatTavernMessageSegmentsForPrompt(segments, {
            escapeText: escapePromptXmlText,
            includeThoughts: false,
          }) || escapePromptXmlText(message.content),
          "</history_narration>",
        ].join("\n"),
        timestamp: message.createdAt,
        metadata: null,
      };
    }

    const character = message.characterId ? characterById.get(message.characterId) : null;
    const parsedReply = character
      ? parseTavernReplyText({
          text: message.content,
          activeCharacter: character,
          characters,
          userPersonaName,
        })
      : null;
    const content = parsedReply?.content || message.content.trim();
    const segments = resolveTavernMessageSegments({
      ...message,
      content,
    });
    const canSeeThought = Boolean(
      visibleThoughtCharacterId && message.characterId === visibleThoughtCharacterId,
    );
    const thought = canSeeThought
      ? message.thought?.trim() || parsedReply?.thought?.trim()
      : "";
    const publicHistoryTag =
      getTavernPresentationContractForMessageKind(message.kind).historyContentTag;
    const thoughtLines = thought
      ? [
          '<history_private_thought visibility="self_only">',
          escapePromptXmlText(thought),
          "</history_private_thought>",
        ]
      : [];

    return {
      id: message.id,
      role: "assistant",
      content: [
        `<history_message role="character" speaker="${escapePromptXmlAttribute(character?.name ?? "角色")}">`,
        `<${publicHistoryTag}>`,
        formatTavernMessageSegmentsForPrompt(segments, {
          escapeText: escapePromptXmlText,
          includeThoughts: false,
        }) || escapePromptXmlText(content),
        `</${publicHistoryTag}>`,
        ...thoughtLines,
        "</history_message>",
      ].join("\n"),
      timestamp: message.createdAt,
      metadata: null,
    };
  });
};
