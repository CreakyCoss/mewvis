import {
  normalizeStringArray,
  normalizeStringRecord,
} from "./normalization";
import type {
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernPendingInteraction,
  TavernReplyOption,
  TavernSceneStatus,
} from "../types";

export const normalizeSceneStatus = (
  value: unknown,
  updatedAt: number,
): TavernSceneStatus | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<TavernSceneStatus>;
  const status: TavernSceneStatus = {
    location: typeof candidate.location === "string" && candidate.location.trim()
      ? candidate.location.trim()
      : undefined,
    timeLabel: typeof candidate.timeLabel === "string" && candidate.timeLabel.trim()
      ? candidate.timeLabel.trim()
      : undefined,
    weather: typeof candidate.weather === "string" && candidate.weather.trim()
      ? candidate.weather.trim()
      : undefined,
    atmosphere: typeof candidate.atmosphere === "string" && candidate.atmosphere.trim()
      ? candidate.atmosphere.trim()
      : undefined,
    scenePhase: typeof candidate.scenePhase === "string" && candidate.scenePhase.trim()
      ? candidate.scenePhase.trim()
      : undefined,
    immediateThreat: typeof candidate.immediateThreat === "string" && candidate.immediateThreat.trim()
      ? candidate.immediateThreat.trim()
      : undefined,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
  };

  return Object.values(status).some((item) => typeof item === "string" && item.trim())
    ? status
    : undefined;
};

export const normalizeCharacterPublicStatuses = (
  value: unknown,
  characterIds: string[],
  characterIdMap: Map<string, string> | undefined,
  updatedAt: number,
): Record<string, TavernCharacterPublicStatus> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const allowedIds = new Set(characterIds);
  const statuses: Record<string, TavernCharacterPublicStatus> = {};
  for (const [sourceCharacterId, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const characterId = characterIdMap?.get(sourceCharacterId) ?? sourceCharacterId;
    if (!allowedIds.has(characterId)) {
      continue;
    }

    const candidate = item as Partial<TavernCharacterPublicStatus>;
    statuses[characterId] = {
      characterId,
      location: typeof candidate.location === "string" && candidate.location.trim()
        ? candidate.location.trim()
        : undefined,
      posture: typeof candidate.posture === "string" && candidate.posture.trim()
        ? candidate.posture.trim()
        : undefined,
      visibleMood: typeof candidate.visibleMood === "string" && candidate.visibleMood.trim()
        ? candidate.visibleMood.trim()
        : undefined,
      outfit: typeof candidate.outfit === "string" && candidate.outfit.trim()
        ? candidate.outfit.trim()
        : undefined,
      visibleInjury: typeof candidate.visibleInjury === "string" && candidate.visibleInjury.trim()
        ? candidate.visibleInjury.trim()
        : undefined,
      holding: normalizeStringArray(candidate.holding),
      publicGoal: typeof candidate.publicGoal === "string" && candidate.publicGoal.trim()
        ? candidate.publicGoal.trim()
        : undefined,
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
    };
  }

  return statuses;
};

export const normalizeCharacterPrivateStatuses = (
  value: unknown,
  characterIds: string[],
  characterIdMap: Map<string, string> | undefined,
  updatedAt: number,
): Record<string, TavernCharacterPrivateStatus> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const allowedIds = new Set(characterIds);
  const statuses: Record<string, TavernCharacterPrivateStatus> = {};
  for (const [sourceCharacterId, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const characterId = characterIdMap?.get(sourceCharacterId) ?? sourceCharacterId;
    if (!allowedIds.has(characterId)) {
      continue;
    }

    const candidate = item as Partial<TavernCharacterPrivateStatus>;
    statuses[characterId] = {
      characterId,
      privateMood: typeof candidate.privateMood === "string" && candidate.privateMood.trim()
        ? candidate.privateMood.trim()
        : undefined,
      suspicion: typeof candidate.suspicion === "string" && candidate.suspicion.trim()
        ? candidate.suspicion.trim()
        : undefined,
      hiddenGoal: typeof candidate.hiddenGoal === "string" && candidate.hiddenGoal.trim()
        ? candidate.hiddenGoal.trim()
        : undefined,
      privateKnowledge: normalizeStringArray(candidate.privateKnowledge),
      relationshipNotes: normalizeStringRecord(candidate.relationshipNotes),
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
    };
  }

  return statuses;
};

export const normalizePendingInteraction = (
  value: unknown,
): TavernPendingInteraction | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernPendingInteraction>;
  const source = candidate.source && typeof candidate.source === "object" ? candidate.source : null;
  const target = candidate.target && typeof candidate.target === "object" ? candidate.target : null;
  const kind = candidate.kind === "request" ||
      candidate.kind === "challenge" ||
      candidate.kind === "invitation" ||
      candidate.kind === "answer"
    ? candidate.kind
    : "question";
  const status = candidate.status === "answered" || candidate.status === "expired"
    ? candidate.status
    : "open";
  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (!candidate.id || !candidate.sourceMessageId || !source || !target || !text) {
    return null;
  }

  const sourceType = source.type === "character" ? "character" : "user";
  const targetType = target.type === "user" ||
      target.type === "character" ||
      target.type === "group"
    ? target.type
    : "unknown";

  return {
    id: candidate.id,
    sourceMessageId: candidate.sourceMessageId,
    source: {
      type: sourceType,
      characterId: typeof source.characterId === "string" ? source.characterId : undefined,
    },
    target: {
      type: targetType,
      characterIds: normalizeStringArray(target.characterIds),
    },
    kind,
    text,
    requiresResponse: candidate.requiresResponse !== false,
    status,
    createdTurnId: typeof candidate.createdTurnId === "string" && candidate.createdTurnId.trim()
      ? candidate.createdTurnId
      : candidate.sourceMessageId,
  };
};

export const normalizeReplyOption = (value: unknown): TavernReplyOption | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernReplyOption>;
  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (!candidate.id || !text) {
    return null;
  }

  const intent = candidate.intent === "ask" ||
      candidate.intent === "act" ||
      candidate.intent === "interrupt" ||
      candidate.intent === "wait" ||
      candidate.intent === "inspect"
    ? candidate.intent
    : "answer";

  return {
    id: candidate.id,
    text,
    respondsToInteractionId: typeof candidate.respondsToInteractionId === "string" &&
        candidate.respondsToInteractionId.trim()
      ? candidate.respondsToInteractionId
      : undefined,
    targetCharacterIds: normalizeStringArray(candidate.targetCharacterIds),
    intent,
  };
};
