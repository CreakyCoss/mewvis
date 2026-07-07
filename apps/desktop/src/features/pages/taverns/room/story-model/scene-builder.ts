import { normalizeVisualPresetId } from "../../tavern/visual-presets";
import { createTavernId as createId, now } from "../../tavern/ids";
import { normalizeStringRecord } from "../../tavern/normalizers/normalization";
import { normalizeRoomCharacterConfigs, roomCharacterMemoriesFromConfigs } from "../../tavern/normalizers/room-character-configs";
import { normalizeSceneRelationshipOverrides } from "../../tavern/normalizers/relationships";
import {
  normalizeCharacterPrivateStatuses,
  normalizeCharacterPublicStatuses,
  normalizePendingInteraction,
  normalizeReplyOption,
  normalizeSceneStatus,
} from "../../tavern/normalizers/scene-state-normalizers";
import type {
  TavernPendingInteraction,
  TavernReplyOption,
} from "@/features/pages/taverns/manage/model";
import type { TavernScene } from "@/features/pages/taverns/room/model";

export const defaultSceneTitle = "默认场景";

type TavernSceneInput = Partial<Omit<TavernScene, "scenePresetId">> & {
  scenePresetId?: unknown;
};

const normalizeSceneCharacterIds = (characterIds: unknown) => {
  const ids = Array.isArray(characterIds)
    ? characterIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return [...new Set(ids)];
};

const numberOrDefault = (value: unknown, defaultValue: number) => (typeof value === "number" ? value : defaultValue);

const trimmedText = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  return text.length > 0 ? text : undefined;
};

const pickText = (value: unknown, defaultValue = "") => trimmedText(value) ?? defaultValue;

const normalizeArray = (value: unknown) => (Array.isArray(value) ? value : []);

const normalizeItems = <T>(items: unknown[], normalize: (item: unknown) => T | null | undefined) =>
  items.map(normalize).filter((item): item is T => Boolean(item));

const pickActiveCharacterId = (inputCharacterId: unknown, characterIds: string[]) => {
  const matchedId =
    typeof inputCharacterId === "string" && characterIds.includes(inputCharacterId) ? inputCharacterId : undefined;

  return matchedId ?? characterIds[0] ?? "";
};

export const buildTavernScene = (input: TavernSceneInput = {}): TavernScene => {
  const timestampNow = now();
  const updatedAt = numberOrDefault(input.updatedAt, timestampNow);
  const createdAt = numberOrDefault(input.createdAt, updatedAt);
  const inputCharacterMemories = normalizeStringRecord(input.characterMemories);
  const characterConfigs = normalizeRoomCharacterConfigs(input.characterConfigs, inputCharacterMemories);
  const characterIds = normalizeSceneCharacterIds(input.characterIds);
  const activeCharacterId = pickActiveCharacterId(input.activeCharacterId, characterIds);

  return {
    id: input.id || createId("scene"),
    order: numberOrDefault(input.order, 0),
    title: trimmedText(input.title) ?? defaultSceneTitle,
    scenePresetId: normalizeVisualPresetId(input.scenePresetId),
    scene: pickText(input.scene, "一张空桌、一盏低灯，以及等待被写下的第一句对白。"),
    sceneGoal: pickText(input.sceneGoal),
    plot: pickText(input.plot),
    storyDirection: pickText(input.storyDirection),
    transition: pickText(input.transition),
    memory: pickText(input.memory),
    relationshipOverrides: normalizeSceneRelationshipOverrides(input.relationshipOverrides, updatedAt),
    sceneStatus: normalizeSceneStatus(input.sceneStatus, updatedAt),
    characterPublicStatuses: normalizeCharacterPublicStatuses(
      input.characterPublicStatuses,
      characterIds,
      undefined,
      updatedAt,
    ),
    characterPrivateStatuses: normalizeCharacterPrivateStatuses(
      input.characterPrivateStatuses,
      characterIds,
      undefined,
      updatedAt,
    ),
    pendingInteractions: normalizeItems<TavernPendingInteraction>(
      normalizeArray(input.pendingInteractions),
      normalizePendingInteraction,
    ),
    replyOptions: normalizeItems<TavernReplyOption>(normalizeArray(input.replyOptions), normalizeReplyOption),
    characterConfigs,
    characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
    characterIds,
    activeCharacterId,
    createdAt,
    updatedAt,
  };
};
