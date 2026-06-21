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
import type {
  TavernDirectorDecision,
} from "./director-decision";
import {
  parseTavernDirectorDecision,
  shouldOfferTavernDirectorRandomEvent,
} from "./director-decision";
import {
  filterTavernFactEventsForAudience,
  buildTavernSchedulingSignals,
  canTavernSelectedTargetsStaySilent,
  formatTavernCharacterRelationships,
  formatTavernDirectorProfileForPrompt,
  formatTavernDirectorSchedulingInstruction,
  formatTavernSchedulingSignalsForPrompt,
  formatTavernVisibleMessagesForRequestContext,
  isTavernDirectorOnlyTurnAllowed,
  normalizeTavernMessagesForAudience,
  tavernBridgeSessionRootDir,
  tavernDirectorAgentRoleId,
} from "../core";
import { runTavernRuntimeAgent } from "./agent";
import { getTavernPromptStylePreset } from "../prompt-styles";
import { getTavernPresentationProfile } from "../presentation-profiles";

export {
  parseTavernDirectorDecision,
  shouldOfferTavernDirectorRandomEvent,
} from "./director-decision";
export type { TavernDirectorDecision } from "./director-decision";

export type RunTavernDirectorInput = {
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  references: TavernReferencedFile[];
  currentUserText: string;
  selectedTargetCharacterIds?: string[];
  maxSpeakers?: number;
  randomEventOpportunity?: boolean;
};

const DIRECTOR_RECENT_MESSAGE_LIMIT = 10;

const limitDirectorContextText = (text: string, maxChars: number) => {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}...`;
};

const formatDirectorProgressContext = (room: TavernRoom) => JSON.stringify({
  statusSnapshot: room.statusSnapshot,
  tasks: room.taskDefinitions.map((task) => ({
    id: task.id,
    title: task.title,
    owner: task.owner,
    participants: task.participants ?? [],
    visibility: task.visibility,
    lifecycle: task.lifecycle,
    currentStatus: room.taskSnapshot[task.id]?.status ?? task.lifecycle.initialStatus,
  })),
  outcomes: room.sceneOutcomes.map((outcome) => ({
    id: outcome.id,
    label: outcome.label,
    condition: outcome.condition,
    winner: outcome.winner ?? [],
    loser: outcome.loser ?? [],
    priority: outcome.priority,
  })),
  recentFacts: filterTavernFactEventsForAudience({
    factEvents: room.factEvents,
    room,
    audience: { type: "director" },
  }).slice(-16).map((fact) => ({
    id: fact.id,
    type: fact.type,
    actor: fact.actor,
    target: fact.target,
    evidence: fact.evidence,
    visibility: fact.visibility,
    visibleToUser: fact.visibleToUser,
    visibleToCharacterIds: fact.visibleToCharacterIds ?? [],
    visibleToFactionIds: fact.visibleToFactionIds ?? [],
  })),
}, null, 2);

export const runTavernDirector = async ({
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  room,
  characters,
  messages,
  references,
  currentUserText,
  selectedTargetCharacterIds = [],
  maxSpeakers = 3,
  randomEventOpportunity,
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
    character.writingStyle ? `writingStyle: ${character.writingStyle}` : "",
    character.replyStylePrompt ? `replyStylePrompt: ${character.replyStylePrompt}` : "",
    character.goals ? `goals: ${character.goals}` : "",
    (() => {
      const relationships = formatTavernCharacterRelationships({
        character,
        characters,
        userPersonaName: room.userPersonaName,
        relationshipOverrides: room.relationshipOverrides,
        statusSnapshot: room.statusSnapshot,
      });
      return relationships ? `relationships: ${relationships}` : "";
    })(),
    room.characterMemories[character.id]?.trim()
      ? `memory: ${room.characterMemories[character.id]?.trim()}`
      : "",
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
  const ambientActionMax = Math.min(2, Math.max(0, characters.length - 1));
  const promptStyle = getTavernPromptStylePreset(room.promptStyleId);
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);
  const canConsiderRandomEvent = randomEventOpportunity ?? shouldOfferTavernDirectorRandomEvent(room);
  const randomEventSchema = canConsiderRandomEvent
    ? `,"randomEvent":"可选；一句公开可观察的随机事件，不触发则留空字符串"`
    : `,"randomEvent":""`;
  const canRequestIllustrationHints = room.settings.illustrationHints.enabled;
  const illustrationHintsSchema = canRequestIllustrationHints
    ? `,"illustrationHints":["可选；1-3 条公开可观察的画面提示"]`
    : `,"illustrationHints":[]`;
  const directorOnlyAllowed = isTavernDirectorOnlyTurnAllowed(room);
  const schedulingInstruction = formatTavernDirectorSchedulingInstruction(room);
  const schedulingSignals = buildTavernSchedulingSignals({
    room,
    characters,
    messages,
    currentUserText,
    selectedTargetCharacterIds,
  });
  const directorProfileText = formatTavernDirectorProfileForPrompt({
    profile: room.settings.directorScheduling.profile,
    characters,
  });
  const schedulingSignalsText = formatTavernSchedulingSignalsForPrompt({
    signals: schedulingSignals,
    characters,
  });
  const selectedTargetsCanStaySilent = canTavernSelectedTargetsStaySilent(
    room,
    selectedTargetCharacterIds,
  );
  const selectedTargetCharacters = selectedTargetCharacterIds
    .map((characterId) => characters.find((character) => character.id === characterId))
    .filter((character): character is TavernCharacter => Boolean(character));
  const directorPrompt = [
    "<output_schema>",
    `{"speakerIds":["character-id"],"nonverbalReplyIds":["character-id"],"ambientActions":[{"characterId":"未发言角色 id","action":"一句可观察动作"}],"narrator":"可选旁白"${randomEventSchema}${illustrationHintsSchema},"reason":"可选简短原因"}`,
    "</output_schema>",
    "",
    `<constraints maxSpeakers="${maxSpeakers}">`,
    "speakerIds 和 nonverbalReplyIds 只能使用下方角色 id；如果需要多人发言，按发言顺序排列。",
    directorOnlyAllowed
      ? "当前阶段允许导演只推进公开流程；如果不应有角色公开发言，可以返回空 speakerIds，并用 narrator 交代公开阶段/结算。"
      : selectedTargetsCanStaySilent
      ? "speakerIds 是本轮角色调用计划，不是氛围描述；若用户明确要求被指定目标只用动作/神态回应，应把该目标放入 nonverbalReplyIds，让角色 Agent 生成自己的心理和动作；若只是弱在场感或无需角色近景反应，才可返回空 speakerIds 并用 ambientActions/narrator 处理。"
      : "speakerIds/nonverbalReplyIds 是本轮角色调用计划，不是氛围描述；只要 characters 非空，二者合计必须至少包含 1 个角色 id。",
    directorOnlyAllowed
      ? "不要为了满足格式硬塞角色发言；夜晚、投票结算、公开结果公布等阶段可只写 narrator。"
      : selectedTargetsCanStaySilent
      ? "不要用空数组表达无事发生；如果目标被明确要求做动作/神态回应，不要把目标写进 ambientActions，而应调度该目标到 nonverbalReplyIds。"
      : "不要用空 speakerIds 和 nonverbalReplyIds 表示沉默、留白、等待或用户要求少说；这种情况选择 1 个最相关角色承接。",
    directorOnlyAllowed
      ? "当用户输入是“嗯”“好”“继续”等短确认时，若当前阶段只需要主持推进，可以返回空 speakerIds。"
      : "当用户输入是“嗯”“好”“继续”等短确认时，也必须选择 1 个角色承接当前岗位状态，不要让 speakerIds 和 nonverbalReplyIds 同时为空。",
    `每轮在 speakerIds/nonverbalReplyIds 中自主选择 1 到 ${maxSpeakers} 个角色，不要为了凑人数而加入无必要发言者。`,
    `如果用户明确点名多个角色发言或给出发言顺序，在 ${maxSpeakers} 人上限内优先按用户点名安排。`,
    "nonverbalReplyIds 可选，只能填写也应被角色 Agent 调用的角色 id；它表示该角色本轮只输出心理和可观察动作，直接对白可以为空。nonverbalReplyIds 中的角色不需要重复写进 speakerIds。",
    "如果用户以某个角色的全名、昵称或可唯一识别称呼开头发出指令/询问，该角色是本轮被点名目标，优先安排其公开回应或行动；除非用户明确要求不用回答/只动作/保持沉默，否则不要放入 nonverbalReplyIds。",
    `普通承接轮次优先选择 1-2 个角色；冲突、会议、多人相关场景可选择最多 ${maxSpeakers} 个角色。`,
    "优先选择最能推进场景目标、回应用户、制造承接关系的角色。",
    "director_profile 是稳定角色调度画像；scheduling_signals 是应用侧每轮根据点名、兴趣、目标、关系、事实、任务和近期发言计算的动态动机。导演可以裁决或修正，但必须优先考虑高分信号和强理由。",
    "scheduling_signals 的 reason 只用于内部调度，不能原样复制进公开 narrator 或泄露到角色公开对白；reason 字段仍只能写公开调度理由。",
    `ambientActions 可选，最多 ${ambientActionMax} 条，只能选择未出现在 speakerIds 和 nonverbalReplyIds 里的角色；只写可被观察到的动作/状态，不写对白、心理、意图或新剧情结果。`,
    "ambientActions 用来让未发言角色保持在场感，例如“莉娜把托盘放回吧台”“莫尔侧身让开门口”；不要为了凑数而生成。",
    "narrator 只能写已发生状态、环境过渡或镜头提示，不要新增关键事实、行动结果或替角色做决定；可为空，建议 40 字内。",
    "reason 只能写公开调度理由，不得包含隐藏身份、阵营、未公开心理、夜间私密行动或验人结果。",
    canConsiderRandomEvent
      ? "randomEvent 由导演决定是否触发；只能写公开可观察的小事件，例如门外脚步、灯火闪动、远处钟声。不要直接解决主线、不要覆盖用户选择、不要替任何角色做关键行动，不触发则输出空字符串。"
      : "randomEvent 当前不可用，必须输出空字符串。",
    canRequestIllustrationHints
      ? "illustrationHints 可选，写 1-3 条适合后续生图的画面提示；只能包含公开可观察的人物、动作、环境、构图和氛围，不写心理、秘密信息、用户未选择的行动或剧情结论。"
      : "illustrationHints 当前不可用，必须输出空数组。",
    "如果已经输出 narrator，后续 speakerIds/nonverbalReplyIds 应选择会对旁白产生角色回应的人；不要安排角色复述 narrator。",
    "输出必须是严格合法 JSON 对象，以 { 开头，以 } 结尾；不要代码块。",
    "</constraints>",
    schedulingInstruction
      ? `\n<director_scheduling_rules>\n${schedulingInstruction}\n</director_scheduling_rules>`
      : "",
    "",
    `<presentation_profile id="${presentationProfile.id}" label="${presentationProfile.label}" render="${presentationProfile.renderStyle}" contract="${presentationProfile.generationContract}">`,
    presentationProfile.directorAddendum,
    "</presentation_profile>",
    "",
    `<prompt_style id="${promptStyle.id}" label="${promptStyle.label}" target="director">`,
    promptStyle.directorAddendum,
    "</prompt_style>",
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
    "<selected_reply_targets instruction=\"targets_addressed_by_user_or_reply_option; may_speak_or_react_nonverbally_depending_on_relationship_and_context\">",
    selectedTargetCharacters.length > 0
      ? selectedTargetCharacters.map((character) => `id: ${character.id}\nname: ${character.name}`).join("\n\n---\n\n")
      : "（无）",
    "</selected_reply_targets>",
    "",
    "<director_profile instruction=\"stable_scheduling_profile; low_frequency; do_not_rewrite_in_this_turn\">",
    directorProfileText,
    "</director_profile>",
    "",
    "<scheduling_signals instruction=\"dynamic_per_turn_recommendations; director_may_override_with_reason; do_not_leak_hidden_or_private_reasons\">",
    schedulingSignalsText || "[]",
    "</scheduling_signals>",
    "",
    "<progress_context instruction=\"director_only; use_for_scheduling_motivation_without_leaking_hidden_facts\">",
    limitDirectorContextText(formatDirectorProgressContext(room), 6000),
    "</progress_context>",
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
    userMessage: "请决定本轮酒馆对话的发言顺序、可选在场动作和可选插图提示，并只输出严格合法 JSON。",
    requestContext: appendReferencesToPrompt(directorPrompt, references),
    runtimeInstruction: [
      "你是酒馆模式的导演 Agent。",
      "你的职责是根据用户输入、场景目标、剧情时间线和角色状态，决定下一轮谁应该发言。",
      `当前呈现模式：${presentationProfile.label}。${presentationProfile.directorAddendum}`,
      `当前房间提示词风格：${promptStyle.label}。${promptStyle.directorAddendum}`,
      "可以插入一条简短旁白来做环境过渡，但不要新增关键事实，不要代替角色行动或长篇发言。",
      canConsiderRandomEvent
        ? "本轮可以考虑随机事件；如果触发，只写公开可观察且不解决主线的小事件。"
        : "本轮不要触发随机事件，randomEvent 必须为空字符串。",
      canRequestIllustrationHints
        ? "本轮可以给出插图提示；插图提示只描述公开可见画面，不参与角色发言。"
        : "本轮不要生成插图提示，illustrationHints 必须为空数组。",
      "ambientActions 只用于未发言角色的公开可观察动作，不是角色对白，也不要写心理。",
      directorOnlyAllowed
        ? "当前阶段允许 speakerIds/nonverbalReplyIds 为空；只有确实需要公开角色发言或非语言近景反应时才安排角色。"
        : selectedTargetsCanStaySilent
        ? "当前候选回复/点名目标可以选择不开口；若用户要求目标只动作/神态回应，仍应安排该目标 nonverbalReplyIds，由角色 Agent 输出动作和心理。"
        : "只要有可用角色，就必须在 speakerIds 或 nonverbalReplyIds 中返回至少一个角色 id；不要用空数组表达沉默。",
      schedulingInstruction,
      "JSON 字符串内不要使用未转义英文双引号；引用用户短句时改用中文引号。",
      "只输出严格合法 JSON，不要输出 Markdown、代码块或解释。",
    ].filter(Boolean).join("\n"),
  });

  try {
    return parseTavernDirectorDecision(
      result.text,
      characters,
      maxSpeakers,
      canConsiderRandomEvent,
      canRequestIllustrationHints,
    );
  } catch {
    return {
      speakerIds: [],
      narrator: undefined,
      reason: undefined,
    };
  }
};
