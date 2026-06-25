import {
  createTavernId as createId,
} from "./ids";
import {
  normalizeStringList,
} from "./normalization";
import type {
  TavernCharacterRelationship,
  TavernRelationshipTarget,
  TavernSceneRelationshipOverride,
} from "./types";

const normalizeRelationshipTarget = (value: unknown): TavernRelationshipTarget | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernRelationshipTarget>;
  if (candidate.type === "user") {
    return { type: "user" };
  }
  if (candidate.type === "character") {
    const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
    return characterId ? { type: "character", characterId } : null;
  }
  return null;
};

export const normalizeCharacterRelationships = (
  value: unknown,
  updatedAt: number,
): TavernCharacterRelationship[] => Array.isArray(value)
  ? value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<TavernCharacterRelationship>;
      const target = normalizeRelationshipTarget(candidate.target);
      if (!target) {
        return [];
      }
      return [{
        id: typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : createId("relationship"),
        target,
        label: typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : undefined,
        attitude: typeof candidate.attitude === "string" && candidate.attitude.trim()
          ? candidate.attitude.trim()
          : undefined,
        publicNote: typeof candidate.publicNote === "string" && candidate.publicNote.trim()
          ? candidate.publicNote.trim()
          : undefined,
        privateNote: typeof candidate.privateNote === "string" && candidate.privateNote.trim()
          ? candidate.privateNote.trim()
          : undefined,
        tags: normalizeStringList(candidate.tags, 8),
        updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
      }];
    })
  : [];

export const normalizeSceneRelationshipOverrides = (
  value: unknown,
  updatedAt: number,
): TavernSceneRelationshipOverride[] => Array.isArray(value)
  ? value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<TavernSceneRelationshipOverride>;
      const subjectCharacterId = typeof candidate.subjectCharacterId === "string"
        ? candidate.subjectCharacterId.trim()
        : "";
      const target = normalizeRelationshipTarget(candidate.target);
      if (!subjectCharacterId || !target) {
        return [];
      }
      return [{
        id: typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : createId("scene-relationship"),
        subjectCharacterId,
        target,
        label: typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : undefined,
        publicNote: typeof candidate.publicNote === "string" && candidate.publicNote.trim()
          ? candidate.publicNote.trim()
          : undefined,
        privateNote: typeof candidate.privateNote === "string" && candidate.privateNote.trim()
          ? candidate.privateNote.trim()
          : undefined,
        tags: normalizeStringList(candidate.tags, 8),
        updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
      }];
    })
  : [];
