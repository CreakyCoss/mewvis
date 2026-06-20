import type {
  TavernCharacter,
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
  },
  autoContinuation: "enabled" as const,
  instruction: "",
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

export const canTavernCharacterUseNonverbalReply = ({
  room,
  characterId,
  selectedTargetCharacterIds,
  currentUserText,
  directorReason,
}: {
  room: Pick<TavernRoom, "settings">;
  characterId: string;
  selectedTargetCharacterIds?: string[];
  currentUserText?: string;
  directorReason?: string | null;
}) =>
  canTavernSelectedTargetsStaySilent(room, selectedTargetCharacterIds) &&
  Boolean(selectedTargetCharacterIds?.includes(characterId)) &&
  (hasTavernNonverbalTargetCue(currentUserText ?? "") ||
    hasTavernNonverbalTargetCue(directorReason ?? ""));

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

export const resolveTavernScheduledSpeakers = ({
  room,
  availableCharacters,
  activeCharacterId,
  directorSpeakerIds,
  selectedTargetCharacterIds,
  currentUserText,
  fallbackCharacter,
}: {
  room: Pick<TavernRoom, "settings" | "statusDefinitions" | "statusSnapshot">;
  availableCharacters: TavernCharacter[];
  activeCharacterId?: string | null;
  directorSpeakerIds: string[];
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
    directorSpeakerIds
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
  const lines = [];
  const customInstruction = scheduling.instruction.trim();
  const fixedOrderPhaseValue = getPhaseValue(room, scheduling.fixedOrder.phaseStatusId);
  const directorOnlyPhaseValue = getPhaseValue(room, scheduling.directorOnlyPhaseStatusId);

  if (customInstruction) {
    lines.push(customInstruction);
  }

  if (isTavernFixedOrderPhase(room)) {
    lines.push([
      "当前处于固定顺序发言阶段。",
      fixedOrderPhaseValue ? `当前阶段值：${fixedOrderPhaseValue}。` : "",
      "导演可以给出公开旁白和未发言角色动作，但角色 speakerIds 会由应用侧按存活座次固定生成。",
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
    lines.push("当用户选择或指定回复对象时，导演必须优先评估被指定角色，但不强制其公开发言；关系差、问题冒犯、沉默人设或策略性回避时，可让该角色只进入 ambientActions、旁白反应或保持沉默。");
    lines.push("如果用户明确表示“不要回答/不用开口/只用动作或神态回应”，应把该目标放入 speakerIds，让角色 Agent 自己输出心理和动作；不要改用旁白替角色完成这类近景反应。");
  }

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
