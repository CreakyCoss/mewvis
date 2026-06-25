import { normalizeTavernAvatarId } from "@/assets/agent-avatars";
import {
  createTavernId as createId,
  now,
} from "./ids";
import {
  normalizeCharacterRelationships,
} from "./relationships";
import {
  getTavernSystemPreset,
  normalizeSystemPresetCharacterId,
  normalizeSystemPresetId,
} from "./system-preset-registry";
import type {
  TavernCharacter,
} from "./types";
import type {
  TavernSystemPresetCharacter,
} from "./system-preset-registry";

export const createTavernCharacterFromSystemPresetCharacter = (
  character: TavernSystemPresetCharacter,
  options: {
    id?: string;
    createdAt?: number;
  } = {},
): TavernCharacter => {
  const createdAt = options.createdAt ?? now();
  return {
    id: options.id ?? createId("character"),
    name: character.name.trim(),
    avatar: normalizeTavernAvatarId(character.avatar),
    description: character.description.trim(),
    speakingStyle: character.speakingStyle.trim(),
    writingStyle: character.writingStyle?.trim() || undefined,
    replyStylePrompt: character.replyStylePrompt?.trim() || undefined,
    goals: character.goals?.trim() || undefined,
    relationships: normalizeCharacterRelationships(character.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};

export const normalizeTavernCharacter = (
  character: TavernCharacter,
  {
    allowSystemPreset = true,
  }: {
    allowSystemPreset?: boolean;
  } = {},
): TavernCharacter => {
  const systemPresetId = allowSystemPreset
    ? normalizeSystemPresetId((character as Partial<TavernCharacter>).systemPresetId)
    : undefined;
  const systemPreset = getTavernSystemPreset(systemPresetId);
  const systemPresetCharacterId = normalizeSystemPresetCharacterId(
    systemPresetId,
    (character as Partial<TavernCharacter>).systemPresetCharacterId,
  );
  const normalizedSystemPresetId = systemPresetCharacterId ? systemPresetId : undefined;

  return {
    ...character,
    avatar: normalizeTavernAvatarId(character.avatar),
    systemPresetId: normalizedSystemPresetId,
    systemPresetCharacterId,
    systemPresetVersion: systemPreset && normalizedSystemPresetId
      ? typeof (character as Partial<TavernCharacter>).systemPresetVersion === "number"
        ? (character as Partial<TavernCharacter>).systemPresetVersion
        : systemPreset.version
      : undefined,
    writingStyle: typeof character.writingStyle === "string" && character.writingStyle.trim()
      ? character.writingStyle.trim()
      : undefined,
    replyStylePrompt: typeof character.replyStylePrompt === "string" && character.replyStylePrompt.trim()
      ? character.replyStylePrompt.trim()
      : undefined,
    relationships: normalizeCharacterRelationships(
      (character as Partial<TavernCharacter>).relationships,
      typeof character.updatedAt === "number" ? character.updatedAt : now(),
    ),
  };
};
