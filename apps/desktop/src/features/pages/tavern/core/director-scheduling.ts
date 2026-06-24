import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
  TavernStatusValue,
} from "../types";
import { getTavernStatusSnapshotValue } from "./progress-engine";
import { orderTavernRoundSpeakers } from "./turn-order";

const defaultDirectorScheduling = {
  targetedReplyPolicy: "prefer" as const,
  maxExtraSpeakersOnTargetedReply: 2,
  allowDirectorOnly: false,
  directorOnlyPhaseStatusId: "",
  directorOnlyPhaseValues: [],
  speakerMotivation: {
    enabled: true,
    maxMotivatedSpeakers: 2,
    rules: [],
  },
  fixedOrder: {
    enabled: false,
    phaseStatusId: "",
    phaseValues: [],
    stopAfterRound: false,
    includeUser: false,
    userPosition: "first" as const,
  },
  autoContinuation: "enabled" as const,
  instruction: "",
};

const defaultDirectorNarrativeControl: TavernRoom["settings"]["directorNarrativeControl"] = {
  responseScale: "balanced",
  narratorPressure: "balanced",
  eventInterruption: "auto",
  userActionConsequence: "visible",
  mainHook: "auto",
  qnaBreak: "auto",
};

const getDirectorScheduling = (
  room: Pick<TavernRoom, "settings">,
) => {
  const candidate = room.settings.directorScheduling;
  if (!candidate) {
    return defaultDirectorScheduling;
  }

  return {
    ...defaultDirectorScheduling,
    ...candidate,
    directorOnlyPhaseValues: candidate.directorOnlyPhaseValues ?? [],
    speakerMotivation: {
      ...defaultDirectorScheduling.speakerMotivation,
      ...candidate.speakerMotivation,
      rules: candidate.speakerMotivation?.rules ?? defaultDirectorScheduling.speakerMotivation.rules,
    },
    fixedOrder: {
      ...defaultDirectorScheduling.fixedOrder,
      ...candidate.fixedOrder,
      phaseValues: candidate.fixedOrder?.phaseValues ?? [],
    },
  };
};

const getDirectorNarrativeControl = (
  room: Pick<TavernRoom, "settings">,
) => ({
  ...defaultDirectorNarrativeControl,
  ...room.settings.directorNarrativeControl,
});

const normalizeStatusValue = (value: TavernStatusValue) =>
  typeof value === "string" ? value.trim() : "";

const getPhaseValue = (
  room: Pick<TavernRoom, "settings" | "statusSnapshot">,
  statusId?: string,
) => {
  const normalizedStatusId = statusId?.trim();
  if (!normalizedStatusId) {
    return "";
  }

  return normalizeStatusValue(getTavernStatusSnapshotValue(
    room.statusSnapshot,
    { type: "global" },
    normalizedStatusId,
  ));
};

const phaseMatches = ({
  room,
  statusId,
  values,
}: {
  room: Pick<TavernRoom, "settings" | "statusSnapshot">;
  statusId?: string;
  values: string[];
}) => {
  const phaseValue = getPhaseValue(room, statusId);
  return Boolean(phaseValue && values.includes(phaseValue));
};

export const isTavernFixedOrderPhase = (
  room: Pick<TavernRoom, "settings" | "statusDefinitions" | "statusSnapshot">,
) => {
  const fixedOrder = getDirectorScheduling(room).fixedOrder;
  return fixedOrder.enabled && phaseMatches({
    room,
    statusId: fixedOrder.phaseStatusId,
    values: fixedOrder.phaseValues,
  });
};

export const isTavernDirectorOnlyTurnAllowed = (
  room: Pick<TavernRoom, "settings" | "statusSnapshot">,
) => {
  const scheduling = getDirectorScheduling(room);
  if (!scheduling.allowDirectorOnly) {
    return false;
  }

  if (!scheduling.directorOnlyPhaseStatusId || scheduling.directorOnlyPhaseValues.length === 0) {
    return true;
  }

  return phaseMatches({
    room,
    statusId: scheduling.directorOnlyPhaseStatusId,
    values: scheduling.directorOnlyPhaseValues,
  });
};

export const isTavernDirectorOnlyPhase = (
  room: Pick<TavernRoom, "settings" | "statusSnapshot">,
) => {
  const scheduling = getDirectorScheduling(room);
  return scheduling.allowDirectorOnly &&
    Boolean(scheduling.directorOnlyPhaseStatusId && scheduling.directorOnlyPhaseValues.length > 0) &&
    phaseMatches({
      room,
      statusId: scheduling.directorOnlyPhaseStatusId,
      values: scheduling.directorOnlyPhaseValues,
    });
};

export const canTavernSelectedTargetsStaySilent = (
  room: Pick<TavernRoom, "settings">,
  selectedTargetCharacterIds?: string[],
) => {
  if (!selectedTargetCharacterIds?.length) {
    return false;
  }

  return getDirectorScheduling(room).targetedReplyPolicy === "prefer";
};

export const hasTavernNonverbalTargetCue = (text: string) =>
  /(?:不用|不必|不要|别)(?:回答|回复|回应|开口)|只(?:用|要)(?:动作|神态|眼神)|(?:动作|神态|眼神)(?:回应|表示)|(?:可以|可)(?:沉默|不回答|不回复|不开口|只用动作)|保持沉默|沉默回应|没有开口|不出声/u.test(text);

const userQuestionPattern =
  /[?？]|(?:谁|什么|为何|为什么|怎么|怎样|是否|是不是|哪里|哪儿|能不能|可以吗|告诉|解释|确认|问)/u;
const userActionPattern =
  /(?:我|旅人|主角|咱们)?(?:走|冲|推|拉|打开|关上|检查|查看|摸|拿|递|绕|躲|追|靠近|离开|拔|点燃|敲|砸|观察|搜|翻|准备|尝试|试图|决定|选择|跟|进入|退出|守|挡|按住|递给|交给|藏|放下|拾起|行动)/u;
const shortContinuePattern = /^(?:嗯|好|继续|接着|然后|行|可以|下一步|往下|看看|走吧)[。.!！\s]*$/u;
const consequencePattern =
  /(?:于是|因此|导致|换来|逼得|不得不|惊动|暴露|锁死|受伤|失去|来不及|已经|变成|推开|打开|关上|断了|裂开|响起|熄灭|暗下|冲淡|留下|发现|逼近|压近)/u;
const interruptionPattern =
  /(?:忽然|突然|门外|窗外|脚步|敲门|撞门|门闩|灯灭|火光|钟声|警报|有人来了|追兵|雨声变大|风灌进来|锁响|杯盏一震)/u;
const mainHookPattern =
  /(?:真相|铜牌|令牌|名单|钥匙|老板娘|东口|后门|路线|失踪|血|追兵|势力|规矩|代价|身份|下一步|来不及|目标|主线|终局|阶段)/u;

const countRecentUserQuestions = (messages: TavernMessage[]) =>
  messages
    .filter((message) => message.role === "user")
    .slice(-4)
    .filter((message) => userQuestionPattern.test(message.content)).length;

const recentText = (messages: TavernMessage[]) =>
  messages
    .slice(-8)
    .map((message) => message.content)
    .join("\n");

const classifyCurrentUserMove = (text: string, isSceneDriveTurn: boolean) => {
  const trimmed = text.trim();
  if (isSceneDriveTurn) {
    return "scene_drive";
  }
  if (shortContinuePattern.test(trimmed)) {
    return "continue";
  }
  if (userActionPattern.test(trimmed)) {
    return "action";
  }
  if (userQuestionPattern.test(trimmed)) {
    return "question";
  }
  return trimmed ? "statement" : "empty";
};

export type TavernSceneDriveGuidance = {
  currentMove: "scene_drive" | "continue" | "action" | "question" | "statement" | "empty";
  controls: TavernRoom["settings"]["directorNarrativeControl"];
  qnaChainRisk: boolean;
  needsUserActionConsequence: boolean;
  needsEventInterruption: boolean;
  needsMainHook: boolean;
  requiredMoves: string[];
  suggestedPublicPressure: string[];
};

export const buildTavernSceneDriveGuidance = ({
  room,
  messages,
  currentUserText,
  isSceneDriveTurn = false,
}: {
  room: Pick<TavernRoom, "sceneGoal" | "scenePlot" | "storyGoal" | "sceneStatus" | "settings">;
  messages: TavernMessage[];
  currentUserText: string;
  isSceneDriveTurn?: boolean;
}): TavernSceneDriveGuidance => {
  const controls = getDirectorNarrativeControl(room);
  const currentMove = classifyCurrentUserMove(currentUserText, isSceneDriveTurn);
  const recent = recentText(messages);
  const recentUserQuestionCount = countRecentUserQuestions(messages);
  const hasRecentConsequence = consequencePattern.test(recent);
  const hasRecentInterruption = interruptionPattern.test(recent);
  const hasRecentMainHook = mainHookPattern.test(recent);
  const hasSceneGoal =
    Boolean(room.sceneGoal.trim() || room.storyGoal.trim() || room.scenePlot.trim());
  const qnaQuestionThreshold = controls.qnaBreak === "aggressive" ? 1 : 2;
  const qnaChainRisk =
    controls.qnaBreak !== "off" &&
    recentUserQuestionCount >= qnaQuestionThreshold &&
    currentMove !== "action" &&
    !hasRecentInterruption;
  const needsUserActionConsequence =
    controls.userActionConsequence === "strict"
      ? (currentMove === "action" || (hasSceneGoal && !hasRecentConsequence))
      : controls.userActionConsequence === "visible"
      ? (currentMove === "action" || (currentMove === "continue" && !hasRecentConsequence && hasSceneGoal))
      : currentMove === "action";
  const needsEventInterruption =
    controls.eventInterruption !== "off" &&
    (qnaChainRisk ||
      (controls.eventInterruption === "forceOnStall" &&
        hasSceneGoal &&
        !hasRecentInterruption &&
        (currentMove === "continue" || currentMove === "question" || currentMove === "scene_drive")) ||
      (controls.eventInterruption === "auto" &&
        hasSceneGoal &&
        !hasRecentInterruption &&
        (currentMove === "continue" || currentMove === "question")));
  const needsMainHook =
    controls.mainHook !== "off" &&
    hasSceneGoal &&
    !hasRecentMainHook &&
    (qnaChainRisk ||
      currentMove === "continue" ||
      currentMove === "scene_drive" ||
      (controls.mainHook === "forceOnStall" && currentMove === "question"));
  const suggestedPublicPressure = [
    room.sceneStatus?.immediateThreat
      ? `推进当前公开威胁：${room.sceneStatus.immediateThreat}`
      : "",
    room.sceneStatus?.weather ? `让天气影响线索或行动：${room.sceneStatus.weather}` : "",
    room.sceneStatus?.timeLabel ? `体现时间压力：${room.sceneStatus.timeLabel}` : "",
    room.sceneStatus?.location ? `利用当前地点制造空间变化：${room.sceneStatus.location}` : "",
  ].filter(Boolean);
  const requiredMoves = [
    needsUserActionConsequence
      ? "本轮必须让用户行动产生公开可见后果，写进 narrator、randomEvent 或被调度角色的正文；不要只让角色继续解释。"
      : "",
    needsEventInterruption
      ? "本轮必须打断纯问答链：加入公开可观察的局势变化、时间压力、外部声音、线索状态变化或角色主动行动。"
      : "",
    needsMainHook
      ? "本轮必须把局部信息接回主线目标、长期代价、势力压力、路线阻断或阶段目标，但不能新增关键真相或替用户选择。"
      : "",
    qnaChainRisk
      ? "如果用户继续点名问询，角色可以先答关键点，再把压力推回现场行动，而不是完整讲解报告。"
      : "",
  ].filter(Boolean);

  return {
    currentMove,
    controls,
    qnaChainRisk,
    needsUserActionConsequence,
    needsEventInterruption,
    needsMainHook,
    requiredMoves,
    suggestedPublicPressure,
  };
};

export const canTavernCharacterUseNonverbalReply = ({
  room,
  characterId,
  selectedTargetCharacterIds,
  directorNonverbalReplyIds,
  currentUserText,
  directorReason,
}: {
  room: Pick<TavernRoom, "settings">;
  characterId: string;
  selectedTargetCharacterIds?: string[];
  directorNonverbalReplyIds?: string[];
  currentUserText?: string;
  directorReason?: string | null;
}) =>
  Boolean(directorNonverbalReplyIds?.includes(characterId)) ||
  (canTavernSelectedTargetsStaySilent(room, selectedTargetCharacterIds) &&
    Boolean(selectedTargetCharacterIds?.includes(characterId)) &&
    (hasTavernNonverbalTargetCue(currentUserText ?? "") ||
      hasTavernNonverbalTargetCue(directorReason ?? "")));

export const shouldSuppressTavernAutoContinuation = (
  room: Pick<TavernRoom, "settings" | "statusDefinitions" | "statusSnapshot">,
) => {
  const policy = getDirectorScheduling(room).autoContinuation;
  if (policy === "disabled") {
    return true;
  }

  return policy === "disabledForFixedOrder" && isTavernFixedOrderPhase(room);
};

const uniqueCharacters = (characters: TavernCharacter[]) => {
  const seen = new Set<string>();
  return characters.filter((character) => {
    if (seen.has(character.id)) {
      return false;
    }
    seen.add(character.id);
    return true;
  });
};

export const mergeTavernCharacterIds = (
  ...characterIdLists: Array<readonly string[] | undefined | null>
) => {
  const seen = new Set<string>();
  return characterIdLists
    .flatMap((list) => list ?? [])
    .flatMap((characterId) => {
      const normalized = characterId.trim();
      if (!normalized || seen.has(normalized)) {
        return [];
      }
      seen.add(normalized);
      return [normalized];
    });
};

export const resolveTavernScheduledSpeakers = ({
  room,
  availableCharacters,
  activeCharacterId,
  directorSpeakerIds,
  directorNonverbalReplyIds,
  selectedTargetCharacterIds,
  currentUserText,
  fallbackCharacter,
}: {
  room: Pick<TavernRoom, "settings" | "statusDefinitions" | "statusSnapshot">;
  availableCharacters: TavernCharacter[];
  activeCharacterId?: string | null;
  directorSpeakerIds: string[];
  directorNonverbalReplyIds?: string[];
  selectedTargetCharacterIds?: string[];
  currentUserText?: string;
  fallbackCharacter?: TavernCharacter | null;
}): TavernCharacter[] => {
  if (isTavernDirectorOnlyPhase(room)) {
    return [];
  }

  if (isTavernFixedOrderPhase(room)) {
    return orderTavernRoundSpeakers({
      room,
      characters: availableCharacters,
      activeCharacterId: activeCharacterId ?? undefined,
    });
  }

  const characterById = new Map(availableCharacters.map((character) => [character.id, character]));
  const rawDirectedSpeakers = uniqueCharacters(
    mergeTavernCharacterIds(directorNonverbalReplyIds, directorSpeakerIds)
      .map((characterId) => characterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character)),
  );
  const targetSpeakers = uniqueCharacters(
    (selectedTargetCharacterIds ?? [])
      .map((characterId) => characterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character)),
  );
  const scheduling = getDirectorScheduling(room);
  const targetedReplyPolicy = scheduling.targetedReplyPolicy;
  const targetIds = new Set(targetSpeakers.map((speaker) => speaker.id));
  const shouldScheduleTargetsForNonverbalReply = canTavernSelectedTargetsStaySilent(
    room,
    selectedTargetCharacterIds,
  ) && hasTavernNonverbalTargetCue(currentUserText ?? "");
  const directedSpeakers = rawDirectedSpeakers;

  if (targetSpeakers.length > 0 && targetedReplyPolicy === "exclusive") {
    return targetSpeakers;
  }

  if (targetSpeakers.length > 0 && targetedReplyPolicy === "include") {
    const maxExtraSpeakers = Math.max(0, scheduling.maxExtraSpeakersOnTargetedReply);
    return uniqueCharacters([
      ...targetSpeakers,
      ...directedSpeakers.filter((speaker) => !targetIds.has(speaker.id)).slice(0, maxExtraSpeakers),
    ]);
  }

  if (targetSpeakers.length > 0 && targetedReplyPolicy === "prefer") {
    if (shouldScheduleTargetsForNonverbalReply) {
      const maxExtraSpeakers = Math.max(0, scheduling.maxExtraSpeakersOnTargetedReply);
      return uniqueCharacters([
        ...targetSpeakers,
        ...directedSpeakers.filter((speaker) => !targetIds.has(speaker.id)).slice(0, maxExtraSpeakers),
      ]);
    }

    return directedSpeakers;
  }

  if (directedSpeakers.length > 0) {
    return directedSpeakers;
  }

  if (isTavernDirectorOnlyTurnAllowed(room)) {
    return [];
  }

  return fallbackCharacter
    ? [fallbackCharacter]
    : availableCharacters.slice(0, 1);
};

export const formatTavernDirectorSchedulingInstruction = (
  room: Pick<TavernRoom, "settings" | "statusDefinitions" | "statusSnapshot">,
) => {
  const scheduling = getDirectorScheduling(room);
  const narrativeControl = getDirectorNarrativeControl(room);
  const lines = [];
  const customInstruction = scheduling.instruction.trim();
  const fixedOrderPhaseValue = getPhaseValue(room, scheduling.fixedOrder.phaseStatusId);
  const directorOnlyPhaseValue = getPhaseValue(room, scheduling.directorOnlyPhaseStatusId);

  if (customInstruction) {
    lines.push(customInstruction);
  }

  lines.push([
    "导演操作策略由应用设置控制，优先级高于呈现风格提示。",
    `调度规模：${narrativeControl.responseScale}。focused=通常 1 个关键角色；balanced=1-2 个角色；ensemble=冲突/会议/多人目标时可接近上限，但仍不得凑人数。`,
    `旁白压力：${narrativeControl.narratorPressure}。low=少旁白；balanced=用短旁白承接场景压力；high=更积极用 narrator 整合环境变化、未发言动作和公开压力。`,
    `问答链打断：${narrativeControl.qnaBreak}；事件打断：${narrativeControl.eventInterruption}；用户行动后果：${narrativeControl.userActionConsequence}；主线钩子：${narrativeControl.mainHook}。`,
  ].join("\n"));

  if (isTavernFixedOrderPhase(room)) {
    lines.push([
      "当前处于固定顺序发言阶段。",
      fixedOrderPhaseValue ? `当前阶段值：${fixedOrderPhaseValue}。` : "",
      "导演可以给出公开旁白和未发言角色动作，但角色 speakerIds 会由应用侧按存活座次固定生成。",
      scheduling.fixedOrder.includeUser
        ? `本阶段固定顺序包含用户座位，用户位置：${scheduling.fixedOrder.userPosition === "last" ? "末位" : "首位"}；当前用户消息视为用户自己的座次发言。`
        : "",
      "如果需要先公布夜晚结果或阶段信息，把内容写进 narrator；不要因此返回空 speakerIds 或把本阶段误判为导演-only。",
      "若发言中点名其他角色，只记录为发言内容；不要把被点名者追加为本轮自动回应者。",
      scheduling.fixedOrder.stopAfterRound
        ? "固定顺序一轮结束后应停在下一阶段入口，例如投票、结算或等待用户操作。"
        : "",
    ].filter(Boolean).join(""));
  }

  if (isTavernDirectorOnlyTurnAllowed(room)) {
    lines.push([
      "当前阶段允许导演只推进公开流程，不调用角色公开发言。",
      directorOnlyPhaseValue ? `当前阶段值：${directorOnlyPhaseValue}。` : "",
      "如果此时是夜晚、结算或投票公布阶段，可以返回空 speakerIds，并只输出 narrator/randomEvent/illustrationHints。",
    ].filter(Boolean).join(""));
  }

  if (scheduling.targetedReplyPolicy === "exclusive") {
    lines.push("当用户选择或指定回复对象时，只让被指定角色发言。");
  } else if (scheduling.targetedReplyPolicy === "include") {
    lines.push(`当用户选择或指定回复对象时，必须包含被指定角色；其他角色最多追加 ${scheduling.maxExtraSpeakersOnTargetedReply} 个，且必须有明确戏剧必要性。`);
  } else if (scheduling.targetedReplyPolicy === "prefer") {
    lines.push("当用户选择或指定回复对象时，导演必须优先评估被指定角色，但不强制其说出口对白；关系差、问题冒犯、沉默人设或策略性回避时，可让该角色进入 nonverbalReplyIds。");
    lines.push("如果用户明确表示“不要回答/不用开口/只用动作或神态回应”，应把该目标放入 nonverbalReplyIds，让角色 Agent 自己输出心理和动作；不要改用旁白替角色完成这类近景反应。");
  }

  lines.push([
    "如果最近多轮都只是用户点名问询、角色逐一解释线索，导演不要机械延续问答链。",
    "应重新评估 sceneGoal、scenePlot、immediateThreat、角色目标和待回应事项，优先安排能带来局势变化、时间压力、关系冲突、风险暴露或下一步行动压力的角色。",
    "此时 narrator 应优先让公开场景状态发生变化，例如线索被雨水冲淡、脚步靠近、灯火变暗、门闩受力、路线时间被压缩；这些变化不能替用户做选择，但要打破纯问答。",
    "可以让未被点名但有强动机/关键现场职责的角色插入异议、提醒、打断或行动提议；不要让用户长期沦为只负责点名提问的提词器。",
  ].join(""));

  if (scheduling.speakerMotivation.enabled) {
    const rulesText = scheduling.speakerMotivation.rules
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .map((rule) => [
        `- [${rule.priority}] ${rule.label}`,
        `  触发：${rule.when}`,
        `  调度倾向：${rule.instruction}`,
      ].join("\n"))
      .join("\n");
    lines.push([
      `自由调度时先评估角色发言动机；除被点名/候选回复目标外，最多额外加入 ${scheduling.speakerMotivation.maxMotivatedSpeakers} 个强动机角色。`,
      "发言动机不是随机概率，而是上下文倾向：角色目标、胜利条件、好感/敌对/任务状态、是否知道相关事实、是否想误导或保护秘密、以及人设是否寡言都会影响是否加入 speakerIds。",
      "同一轮不要为了热闹让所有人发言；弱动机角色优先用 ambientActions 保持在场。被明确要求动作回应的目标角色不属于弱动机旁观者，应作为非语言角色回复处理。",
      rulesText,
    ].filter(Boolean).join("\n"));
  }

  if (shouldSuppressTavernAutoContinuation(room)) {
    lines.push("本阶段禁用自动续调度；角色提出问题或点名他人，也不会在同一轮内自动追加被点名角色发言。");
  }

  return lines.join("\n");
};
