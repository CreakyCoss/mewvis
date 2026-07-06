import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { TavernMessage } from "../types";
import type {
  TavernCharacter,
  TavernDirectorCharacterProfile,
  TavernDirectorProfile,
  TavernDirectorReplyModePreference,
  TavernDirectorSpeechBias,
  TavernFactEvent,
  TavernSchedulingSignal,
  TavernStatusDefinition,
  TavernStatusValue,
  TavernTaskDefinition,
  TavernTaskState,
} from "@/features/pages/taverns/manage/model";
import { isTavernDirectorOnlyPhase, isTavernFixedOrderPhase } from "./director-scheduling";
import { filterTavernFactEventsForAudience } from "./information-policy";
import { getTavernStatusSnapshotValue, tavernRelationshipKey } from "./progress-engine";
import { formatTavernCharacterRelationships } from "./relationships";

const PROFILE_TAG_LIMIT = 12;
const PROFILE_TEXT_LIMIT = 160;
const SIGNAL_REASON_LIMIT = 6;
const RECENT_MESSAGE_SIGNAL_LIMIT = 8;
const RECENT_FACT_SIGNAL_LIMIT = 18;

const speechBiasValues: TavernDirectorSpeechBias[] = ["very_low", "low", "balanced", "high", "very_high"];

const normalizeText = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const trimLimited = (value: unknown, maxLength = PROFILE_TEXT_LIMIT) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeStringList = (value: unknown, maxItems = PROFILE_TAG_LIMIT, maxLength = 36) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.flatMap((item) => {
            const text = trimLimited(item, maxLength);
            return text ? [text] : [];
          }),
        ),
      ].slice(0, maxItems)
    : [];

const normalizeSpeechBias = (
  value: unknown,
  fallback: TavernDirectorSpeechBias = "balanced",
): TavernDirectorSpeechBias =>
  speechBiasValues.includes(value as TavernDirectorSpeechBias) ? (value as TavernDirectorSpeechBias) : fallback;

const biasScore = (bias: TavernDirectorSpeechBias | undefined) => {
  switch (bias) {
    case "very_low":
      return -18;
    case "low":
      return -9;
    case "high":
      return 9;
    case "very_high":
      return 16;
    case "balanced":
    default:
      return 0;
  }
};

const biasLabel = (bias: TavernDirectorSpeechBias | undefined) => {
  switch (bias) {
    case "very_low":
      return "极低";
    case "low":
      return "偏低";
    case "high":
      return "偏高";
    case "very_high":
      return "极高";
    case "balanced":
    default:
      return "均衡";
  }
};

const uniquePush = (target: string[], value: string) => {
  const trimmed = value.trim();
  if (trimmed && !target.includes(trimmed)) {
    target.push(trimmed);
  }
};

const entityMatchesCharacter = (entity: TavernFactEvent["actor"] | TavernFactEvent["target"], characterId: string) =>
  entity?.type === "character" && entity.characterId === characterId;

const taskEntityMatchesCharacter = (entity: TavernTaskDefinition["owner"], characterId: string) =>
  entity.type === "character" && entity.characterId === characterId;

const taskIncludesCharacter = (task: TavernTaskDefinition, characterId: string) =>
  taskEntityMatchesCharacter(task.owner, characterId) ||
  (task.participants ?? []).some((participant) => taskEntityMatchesCharacter(participant, characterId));

const isActiveTask = (task: TavernTaskDefinition, taskSnapshot: Record<string, TavernTaskState>) => {
  const status = taskSnapshot[task.id]?.status ?? task.lifecycle.initialStatus;
  return status === "active";
};

const relationshipStatusLooksMotivating = (definition: TavernStatusDefinition) => {
  const text = normalizeText(`${definition.id} ${definition.label} ${definition.description ?? ""}`);
  return /favor|affection|trust|hostility|rival|bond|好感|信任|敌对|关系|承诺|竞争|仇恨|亲密/u.test(text);
};

const statusValueHasStake = (value: TavernStatusValue) => {
  if (typeof value === "number") {
    return Math.abs(value) >= 20;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === "string" && value.trim().length > 0;
};

const textMatchesAnyTag = (text: string, tags: string[]) => {
  const normalizedText = normalizeText(text);
  return tags.some((tag) => {
    const normalizedTag = normalizeText(tag);
    return normalizedTag.length >= 2 && normalizedText.includes(normalizedTag);
  });
};

const extractLooseTags = (text: string, maxItems = 6) =>
  [
    ...new Set(
      text
        .split(/[，,。；;、/｜|：:\n\r\t（）()[\]{}<>《》【】"'“”‘’!?！？\s]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2 && item.length <= 12)
        .filter((item) => !/^(一个|一种|当前|自己|角色|目标|关系|公开|回应|自然|保持)$/u.test(item)),
    ),
  ].slice(0, maxItems);

const inferSpeechBias = (character: TavernCharacter): TavernDirectorSpeechBias => {
  const relationshipText = formatTavernCharacterRelationships({ character });
  const text = normalizeText(
    [
      character.description,
      character.speakingStyle,
      character.writingStyle,
      character.replyStylePrompt,
      character.goals,
      relationshipText,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (/沉默|寡言|冷淡|克制|谨慎|观察者|少言|不轻易|内敛|回避/u.test(text)) {
    return "low";
  }
  if (/热情|健谈|活泼|主动|抢话|爱说|轻快|外向|话多|锋利|尖锐/u.test(text)) {
    return "high";
  }
  return "balanced";
};

export const createTavernDirectorCharacterProfile = (character: TavernCharacter): TavernDirectorCharacterProfile => {
  const speechBias = inferSpeechBias(character);
  const descriptionTags = extractLooseTags(character.description);
  const goalTags = extractLooseTags(character.goals ?? "");
  const relationshipText = formatTavernCharacterRelationships({ character });
  const relationshipTags = extractLooseTags(relationshipText, 4);

  return {
    characterId: character.id,
    temperament: descriptionTags[0] ?? undefined,
    speechBias,
    nonverbalBias: speechBias === "low" || speechBias === "very_low" ? "high" : "balanced",
    interestTags: descriptionTags,
    goalTags,
    knowledgeTags: relationshipTags,
    conflictStyle: /回避|克制|谨慎|冷淡/u.test([character.description, relationshipText].join(" "))
      ? "克制或回避"
      : undefined,
    socialStrategy: character.goals?.trim() || undefined,
    speechTriggers: goalTags,
    silenceTriggers: speechBias === "low" || speechBias === "very_low" ? ["未被点名", "无关键事实", "弱利益相关"] : [],
    notes: character.replyStylePrompt?.trim() || undefined,
  };
};

export const createTavernDirectorProfileFromCharacters = ({
  room,
  characters,
  source = "system",
  updatedAt,
}: {
  room?: Pick<TavernRoom, "storyGoal" | "sceneGoal" | "settings">;
  characters: TavernCharacter[];
  source?: TavernDirectorProfile["source"];
  updatedAt?: number;
}): TavernDirectorProfile => ({
  version: 1,
  source,
  globalGoals: [room?.storyGoal?.trim() ?? "", room?.sceneGoal?.trim() ?? ""].filter(Boolean).slice(0, 6),
  globalRules: [
    ...(room?.settings.directorScheduling.instruction.trim()
      ? [room.settings.directorScheduling.instruction.trim()]
      : []),
    ...(room?.settings.directorScheduling.speakerMotivation.rules.map((rule) => rule.label) ?? []),
  ]
    .filter(Boolean)
    .slice(0, 12),
  characterProfiles: Object.fromEntries(
    characters.map((character) => [character.id, createTavernDirectorCharacterProfile(character)]),
  ),
  updatedAt,
});

const normalizeCharacterProfile = (value: unknown, characterId: string): TavernDirectorCharacterProfile | null => {
  if (!characterId || !value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernDirectorCharacterProfile>;
  return {
    characterId,
    temperament: trimLimited(candidate.temperament) || undefined,
    speechBias: normalizeSpeechBias(candidate.speechBias),
    nonverbalBias: candidate.nonverbalBias === undefined ? undefined : normalizeSpeechBias(candidate.nonverbalBias),
    interestTags: normalizeStringList(candidate.interestTags),
    goalTags: normalizeStringList(candidate.goalTags),
    knowledgeTags: normalizeStringList(candidate.knowledgeTags),
    conflictStyle: trimLimited(candidate.conflictStyle) || undefined,
    socialStrategy: trimLimited(candidate.socialStrategy) || undefined,
    speechTriggers: normalizeStringList(candidate.speechTriggers),
    silenceTriggers: normalizeStringList(candidate.silenceTriggers),
    notes: trimLimited(candidate.notes, 240) || undefined,
  };
};

export const normalizeTavernDirectorProfile = (
  value: unknown,
  options: {
    characters?: TavernCharacter[];
    characterIds?: string[];
    mapCharacterId?: (characterId: string) => string | undefined;
    source?: TavernDirectorProfile["source"];
    updatedAt?: number;
  } = {},
): TavernDirectorProfile | undefined => {
  const allowedIds = new Set(
    [...(options.characterIds ?? []), ...(options.characters?.map((character) => character.id) ?? [])].filter(Boolean),
  );
  const fallbackProfiles = Object.fromEntries(
    (options.characters ?? []).map((character) => [character.id, createTavernDirectorCharacterProfile(character)]),
  );

  if (!value || typeof value !== "object") {
    return options.characters?.length
      ? {
          version: 1,
          source: options.source ?? "system",
          globalGoals: [],
          globalRules: [],
          characterProfiles: fallbackProfiles,
          updatedAt: options.updatedAt,
        }
      : undefined;
  }

  const candidate = value as Partial<TavernDirectorProfile>;
  const source =
    candidate.source === "preset" ||
    candidate.source === "generated" ||
    candidate.source === "manual" ||
    candidate.source === "system"
      ? candidate.source
      : (options.source ?? "manual");
  const rawProfiles =
    candidate.characterProfiles && typeof candidate.characterProfiles === "object"
      ? Object.entries(candidate.characterProfiles as Record<string, unknown>)
      : [];
  const mappedProfiles: Record<string, TavernDirectorCharacterProfile> = {};

  for (const [key, rawProfile] of rawProfiles) {
    const rawCharacterId =
      typeof (rawProfile as Partial<TavernDirectorCharacterProfile>)?.characterId === "string"
        ? ((rawProfile as Partial<TavernDirectorCharacterProfile>).characterId?.trim() ?? "")
        : key.trim();
    const mappedCharacterId =
      options.mapCharacterId?.(rawCharacterId) ??
      (allowedIds.size === 0 || allowedIds.has(rawCharacterId) ? rawCharacterId : undefined);
    if (!mappedCharacterId) {
      continue;
    }

    const profile = normalizeCharacterProfile(rawProfile, mappedCharacterId);
    if (profile) {
      mappedProfiles[mappedCharacterId] = {
        ...(fallbackProfiles[mappedCharacterId] ?? {}),
        ...profile,
        characterId: mappedCharacterId,
      };
    }
  }

  for (const [characterId, fallbackProfile] of Object.entries(fallbackProfiles)) {
    if (!mappedProfiles[characterId]) {
      mappedProfiles[characterId] = fallbackProfile;
    }
  }

  return {
    version: 1,
    source,
    globalGoals: normalizeStringList(candidate.globalGoals, 10, 120),
    globalRules: normalizeStringList(candidate.globalRules, 16, 180),
    characterProfiles: mappedProfiles,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : options.updatedAt,
  };
};

const profileForCharacter = (room: Pick<TavernRoom, "settings">, character: TavernCharacter) =>
  room.settings.directorScheduling.profile?.characterProfiles[character.id] ??
  createTavernDirectorCharacterProfile(character);

const recentCharacterMessageCount = (messages: TavernMessage[], characterId: string) =>
  messages
    .slice(-RECENT_MESSAGE_SIGNAL_LIMIT)
    .filter((message) => message.role === "character" && message.characterId === characterId).length;

const characterHasRelatedVisibleFact = ({
  room,
  characterId,
  currentText,
}: {
  room: Pick<TavernRoom, "factEvents" | "settings"> & Partial<Pick<TavernRoom, "outcomeEvents">>;
  characterId: string;
  currentText: string;
}) => {
  const recentFacts = filterTavernFactEventsForAudience({
    factEvents: room.factEvents,
    room: {
      settings: room.settings,
      outcomeEvents: room.outcomeEvents ?? [],
    },
    audience: { type: "character", characterId },
  }).slice(-RECENT_FACT_SIGNAL_LIMIT);
  const normalizedCurrentText = normalizeText(currentText);
  const currentKeywords = extractLooseTags(normalizedCurrentText, 8);

  return recentFacts.some((fact) => {
    if (entityMatchesCharacter(fact.actor, characterId) || entityMatchesCharacter(fact.target, characterId)) {
      return true;
    }

    return currentKeywords.some(
      (keyword) => keyword.length >= 2 && normalizeText(`${fact.type} ${fact.evidence}`).includes(keyword),
    );
  });
};

const characterHasRelationshipStake = ({
  room,
  characterId,
}: {
  room: Pick<TavernRoom, "statusDefinitions" | "statusSnapshot">;
  characterId: string;
}) => {
  const userRef = { type: "user", userId: "user" } as const;
  const characterRef = { type: "character", characterId } as const;
  const motivatingDefinitions = room.statusDefinitions.filter(
    (definition) => definition.scope === "relationship" && relationshipStatusLooksMotivating(definition),
  );

  return motivatingDefinitions.some((definition) => {
    const towardUser = getTavernStatusSnapshotValue(
      room.statusSnapshot,
      {
        type: "relationship",
        subject: characterRef,
        object: userRef,
      },
      definition.id,
    );
    const fromUser = getTavernStatusSnapshotValue(
      room.statusSnapshot,
      {
        type: "relationship",
        subject: userRef,
        object: characterRef,
      },
      definition.id,
    );
    return statusValueHasStake(towardUser) || statusValueHasStake(fromUser);
  });
};

const characterHasActiveTaskStake = ({
  room,
  characterId,
}: {
  room: Pick<TavernRoom, "taskDefinitions" | "taskSnapshot">;
  characterId: string;
}) =>
  room.taskDefinitions.some(
    (task) => taskIncludesCharacter(task, characterId) && isActiveTask(task, room.taskSnapshot),
  );

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

const signalModes = ({
  score,
  isDirectTarget,
  profile,
}: {
  score: number;
  isDirectTarget: boolean;
  profile: TavernDirectorCharacterProfile;
}): TavernDirectorReplyModePreference[] => {
  const modes: TavernDirectorReplyModePreference[] = [];
  if (score >= 45 || isDirectTarget) {
    modes.push("speech");
  }
  if (
    isDirectTarget ||
    profile.nonverbalBias === "high" ||
    profile.nonverbalBias === "very_high" ||
    profile.speechBias === "low" ||
    profile.speechBias === "very_low"
  ) {
    modes.push("nonverbal");
  }
  if (score < 55) {
    modes.push("ambient");
  }
  return [...new Set(modes)];
};

export const buildTavernSchedulingSignals = ({
  room,
  characters,
  messages,
  currentUserText,
  selectedTargetCharacterIds = [],
}: {
  room: Pick<
    TavernRoom,
    | "settings"
    | "statusDefinitions"
    | "statusSnapshot"
    | "factEvents"
    | "outcomeEvents"
    | "taskDefinitions"
    | "taskSnapshot"
  >;
  characters: TavernCharacter[];
  messages: TavernMessage[];
  currentUserText: string;
  selectedTargetCharacterIds?: string[];
}): TavernSchedulingSignal[] => {
  if (isTavernDirectorOnlyPhase(room)) {
    return [];
  }

  const selectedTargetIds = new Set(selectedTargetCharacterIds);
  const recentText = [
    currentUserText,
    ...messages.slice(-RECENT_MESSAGE_SIGNAL_LIMIT).map((message) => message.content),
  ].join("\n");
  const fixedOrder = isTavernFixedOrderPhase(room);
  const signals = characters.map((character) => {
    const profile = profileForCharacter(room, character);
    const reasons: string[] = [];
    const matchedRuleIds: string[] = [];
    let score = 35 + biasScore(profile.speechBias);

    if (profile.speechBias !== "balanced") {
      uniquePush(reasons, `发言倾向${biasLabel(profile.speechBias)}`);
    }

    if (fixedOrder) {
      score += 45;
      uniquePush(reasons, "当前阶段按固定座次发言");
      matchedRuleIds.push("fixed-order-phase");
    }

    const isDirectTarget = selectedTargetIds.has(character.id);
    if (isDirectTarget) {
      score += 45;
      uniquePush(reasons, "被用户或候选回复直接指定");
      matchedRuleIds.push("direct-target-priority");
    } else if (currentUserText.includes(character.name)) {
      score += 32;
      uniquePush(reasons, "用户输入包含角色名");
      matchedRuleIds.push("direct-target-priority");
    }

    if (textMatchesAnyTag(recentText, profile.interestTags)) {
      score += 16;
      uniquePush(reasons, "命中角色兴趣或关注主题");
      matchedRuleIds.push("profile-interest");
    }

    if (textMatchesAnyTag(recentText, [...profile.goalTags, ...profile.speechTriggers])) {
      score += 18;
      uniquePush(reasons, "与角色目标或触发条件一致");
      matchedRuleIds.push("goal-competes-for-user-attention");
    }

    if (
      characterHasRelatedVisibleFact({
        room,
        characterId: character.id,
        currentText: currentUserText,
      })
    ) {
      score += 14;
      uniquePush(reasons, "角色掌握或关联近期可见事实");
      matchedRuleIds.push("knowledge-holder-helps-or-misdirects");
    }

    if (characterHasRelationshipStake({ room, characterId: character.id })) {
      score += 12;
      uniquePush(reasons, "关系状态存在调度利益");
      matchedRuleIds.push("relationship-stakes");
    }

    if (characterHasActiveTaskStake({ room, characterId: character.id })) {
      score += 16;
      uniquePush(reasons, "角色有活跃任务或胜负目标");
      matchedRuleIds.push("active-task-stake");
    }

    const recentSpeechCount = recentCharacterMessageCount(messages, character.id);
    if (recentSpeechCount >= 2 && !isDirectTarget && !fixedOrder) {
      score -= 14;
      uniquePush(reasons, "近期已连续发言，降低抢话倾向");
      matchedRuleIds.push("recent-speaker-cooldown");
    }

    const hasStrongReason = score >= 55 || isDirectTarget || fixedOrder;
    if (!hasStrongReason && (profile.speechBias === "low" || profile.speechBias === "very_low")) {
      score -= 8;
      uniquePush(reasons, "沉默人设且无强动机");
      matchedRuleIds.push("quiet-temperament-brake");
    }

    const clampedScore = clampScore(score);
    return {
      characterId: character.id,
      score: clampedScore,
      reasons: reasons.slice(0, SIGNAL_REASON_LIMIT),
      suggestedModes: signalModes({
        score: clampedScore,
        isDirectTarget,
        profile,
      }),
      matchedRuleIds: [...new Set(matchedRuleIds)].slice(0, 8),
    };
  });

  return signals.sort((left, right) => right.score - left.score);
};

export const formatTavernDirectorProfileForPrompt = ({
  profile,
  characters,
}: {
  profile?: TavernDirectorProfile;
  characters: TavernCharacter[];
}) => {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const normalizedProfile =
    profile ??
    createTavernDirectorProfileFromCharacters({
      characters,
      source: "system",
    });

  return JSON.stringify(
    {
      version: normalizedProfile.version,
      source: normalizedProfile.source,
      globalGoals: normalizedProfile.globalGoals,
      globalRules: normalizedProfile.globalRules,
      characterProfiles: Object.values(normalizedProfile.characterProfiles)
        .filter((characterProfile) => characterById.has(characterProfile.characterId))
        .map((characterProfile) => ({
          characterId: characterProfile.characterId,
          name: characterById.get(characterProfile.characterId)?.name ?? characterProfile.characterId,
          temperament: characterProfile.temperament ?? "",
          speechBias: characterProfile.speechBias,
          nonverbalBias: characterProfile.nonverbalBias ?? "balanced",
          interestTags: characterProfile.interestTags,
          goalTags: characterProfile.goalTags,
          knowledgeTags: characterProfile.knowledgeTags,
          conflictStyle: characterProfile.conflictStyle ?? "",
          socialStrategy: characterProfile.socialStrategy ?? "",
          speechTriggers: characterProfile.speechTriggers,
          silenceTriggers: characterProfile.silenceTriggers,
          notes: characterProfile.notes ?? "",
        })),
    },
    null,
    2,
  );
};

export const formatTavernSchedulingSignalsForPrompt = ({
  signals,
  characters,
}: {
  signals: TavernSchedulingSignal[];
  characters: TavernCharacter[];
}) => {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  return JSON.stringify(
    signals.map((signal) => ({
      characterId: signal.characterId,
      name: characterById.get(signal.characterId)?.name ?? signal.characterId,
      score: signal.score,
      reasons: signal.reasons,
      suggestedModes: signal.suggestedModes,
      matchedRuleIds: signal.matchedRuleIds,
    })),
    null,
    2,
  );
};

export const formatTavernRelationshipKeyForScheduling = tavernRelationshipKey;
