import {
  mapTavernStatusSnapshot,
} from "./character-id-mapping";
import {
  createTavernId as createId,
} from "../ids";
import {
  normalizeCharacterRelationships,
} from "./relationships";
import type {
  TavernCharacter,
  TavernEntityRef,
  TavernFactEvent,
  TavernGeneratedPresetJson,
} from "../types";

export const trimGeneratedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const rememberGeneratedCharacterKey = (
  characterIdByGeneratedKey: Map<string, string>,
  key: unknown,
  characterId: string,
) => {
  const text = trimGeneratedString(key);
  if (!text) {
    return;
  }

  characterIdByGeneratedKey.set(text, characterId);
  characterIdByGeneratedKey.set(text.toLowerCase(), characterId);
};

export const resolveGeneratedCharacterId = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  const text = trimGeneratedString(value);
  if (!text) {
    return undefined;
  }

  return characterIdByGeneratedKey.get(text) ??
    characterIdByGeneratedKey.get(text.toLowerCase());
};

export const normalizeGeneratedCharacterIds = (
  value: unknown,
  fallback: string[],
  characterIdByGeneratedKey: Map<string, string>,
) => {
  const sourceIds = Array.isArray(value) ? value : [];
  const ids = sourceIds.flatMap((item) => {
    const characterId = resolveGeneratedCharacterId(item, characterIdByGeneratedKey);
    return characterId ? [characterId] : [];
  });

  return [...new Set(ids.length > 0 ? ids : fallback)];
};

export const normalizeGeneratedStringRecord = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const characterId = resolveGeneratedCharacterId(key, characterIdByGeneratedKey);
      const text = trimGeneratedString(item);
      return characterId && text ? [[characterId, text]] : [];
    }),
  );
};

export const normalizeGeneratedCharacterObjectRecord = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const characterId = resolveGeneratedCharacterId(key, characterIdByGeneratedKey);
      return characterId && item && typeof item === "object"
        ? [[characterId, item]]
        : [];
    }),
  );
};

export const normalizeGeneratedStatusSnapshot = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  const mapGeneratedCharacterId = (characterId: string) =>
    resolveGeneratedCharacterId(characterId, characterIdByGeneratedKey);
  return mapTavernStatusSnapshot(value, mapGeneratedCharacterId);
};

export const normalizeGeneratedEntityRef = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
): TavernEntityRef | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<TavernEntityRef> & Record<string, unknown>;
  if (candidate.type === "user") {
    return { type: "user", userId: "user" };
  }
  if (candidate.type === "character") {
    const characterId = resolveGeneratedCharacterId(candidate.characterId, characterIdByGeneratedKey);
    return characterId ? { type: "character", characterId } : undefined;
  }
  if (candidate.type === "global") {
    return { type: "global" };
  }
  if (candidate.type === "scene") {
    const sceneId = trimGeneratedString(candidate.sceneId);
    return sceneId ? { type: "scene", sceneId } : { type: "scene", sceneId: "current" };
  }
  if (candidate.type === "team") {
    const teamId = trimGeneratedString(candidate.teamId);
    return teamId ? { type: "team", teamId } : undefined;
  }
  if (candidate.type === "faction") {
    const factionId = trimGeneratedString(candidate.factionId);
    return factionId ? { type: "faction", factionId } : undefined;
  }
  if (candidate.type === "party") {
    const partyId = trimGeneratedString(candidate.partyId);
    return partyId ? { type: "party", partyId } : undefined;
  }
  return undefined;
};

export const createGeneratedFactEvent = (
  value: unknown,
  index: number,
  createdAt: number,
  characterIdByGeneratedKey: Map<string, string>,
): TavernFactEvent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<TavernFactEvent>;
  const type = trimGeneratedString(candidate.type);
  const evidence = trimGeneratedString(candidate.evidence);
  if (!type || !evidence) {
    return null;
  }

  const visibility = candidate.visibility === "owner" ||
      candidate.visibility === "team" ||
      candidate.visibility === "private" ||
      candidate.visibility === "director" ||
      candidate.visibility === "hidden" ||
      candidate.visibility === "debug" ||
      candidate.visibility === "public"
    ? candidate.visibility
    : "public";
  const revealWhen = candidate.revealWhen === "sceneOutcome" ||
      candidate.revealWhen === "never" ||
      candidate.revealWhen === "manual"
    ? candidate.revealWhen
    : undefined;
  const visibleToCharacterIds = Array.isArray(candidate.visibleToCharacterIds)
    ? candidate.visibleToCharacterIds.flatMap((id) => {
        const characterId = resolveGeneratedCharacterId(id, characterIdByGeneratedKey);
        return characterId ? [characterId] : [];
      })
    : [];
  const visibleToFactionIds = Array.isArray(candidate.visibleToFactionIds)
    ? candidate.visibleToFactionIds.flatMap((id) => {
        const factionId = trimGeneratedString(id);
        return factionId ? [factionId] : [];
      })
    : [];
  const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
    ? Math.min(1, Math.max(0, candidate.confidence))
    : 1;

  return {
    id: trimGeneratedString(candidate.id) || createId("fact"),
    turnId: trimGeneratedString(candidate.turnId) || "initial",
    sourceMessageIds: Array.isArray(candidate.sourceMessageIds)
      ? candidate.sourceMessageIds.flatMap((id) => {
          const text = trimGeneratedString(id);
          return text ? [text] : [];
        })
      : [],
    type,
    ...(normalizeGeneratedEntityRef(candidate.actor, characterIdByGeneratedKey)
      ? { actor: normalizeGeneratedEntityRef(candidate.actor, characterIdByGeneratedKey) }
      : {}),
    ...(normalizeGeneratedEntityRef(candidate.target, characterIdByGeneratedKey)
      ? { target: normalizeGeneratedEntityRef(candidate.target, characterIdByGeneratedKey) }
      : {}),
    ...(candidate.intensity ? { intensity: candidate.intensity } : {}),
    ...(typeof candidate.value === "number" && Number.isFinite(candidate.value) ? { value: candidate.value } : {}),
    evidence,
    confidence,
    visibility,
    ...(revealWhen ? { revealWhen } : {}),
    ...(candidate.visibleToUser ? { visibleToUser: true } : {}),
    ...(visibleToCharacterIds.length > 0 ? { visibleToCharacterIds } : {}),
    ...(visibleToFactionIds.length > 0 ? { visibleToFactionIds } : {}),
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : createdAt + index,
  };
};

export const createGeneratedCharacter = (
  character: NonNullable<TavernGeneratedPresetJson["characters"]>[number],
  index: number,
  createdAt: number,
): TavernCharacter | null => {
  const name = trimGeneratedString(character.name) || `角色 ${index + 1}`;
  const description = trimGeneratedString(character.description);
  const speakingStyle = trimGeneratedString(character.speakingStyle);
  if (!description && !speakingStyle) {
    return null;
  }

  return {
    id: createId("character"),
    name,
    avatar: trimGeneratedString(character.avatar),
    description,
    speakingStyle: speakingStyle || "自然回应，保持人设一致。",
    writingStyle: trimGeneratedString(character.writingStyle) || undefined,
    replyStylePrompt: trimGeneratedString(character.replyStylePrompt) || undefined,
    goals: trimGeneratedString(character.goals) || undefined,
    relationships: normalizeCharacterRelationships(character.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};
