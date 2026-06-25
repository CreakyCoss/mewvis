import {
  DEFAULT_VISUAL_PRESET_ID,
  normalizeVisualPresetId,
} from "../visual-presets";
import {
  createTavernId as createId,
  now,
} from "../ids";
import {
  normalizeStringRecord,
} from "../normalizers/normalization";
import {
  normalizeAssetDraft,
  normalizeIllustrationHints,
} from "../normalizers/asset-normalizers";
import {
  normalizeRoomCharacterConfigs,
  roomCharacterMemoriesFromConfigs,
} from "../normalizers/room-character-configs";
import {
  normalizeSceneRelationshipOverrides,
} from "../normalizers/relationships";
import {
  normalizeCharacterPrivateStatuses,
  normalizeCharacterPublicStatuses,
  normalizePendingInteraction,
  normalizeReplyOption,
  normalizeSceneStatus,
} from "../normalizers/scene-state-normalizers";
import {
  normalizeFactEvents,
  normalizeOutcomeEvents,
  normalizeProgressCheckpoints,
  normalizeSceneOutcomes,
  normalizeStatusEvents,
  normalizeStatusSnapshot,
  normalizeTaskDefinitions,
  normalizeTaskEvents,
  normalizeTaskSnapshot,
} from "../normalizers/status-normalizers";
import type {
  TavernAssetDraft,
  TavernPendingInteraction,
  TavernReplyOption,
  TavernRoom,
  TavernScene,
} from "../types";

export const defaultSceneTitle = "默认场景";

export type TavernSceneInput = Partial<Omit<TavernScene, "scenePresetId">> & {
  scenePresetId?: unknown;
};

export const normalizeRoomScenePresetId = (room: Partial<TavernRoom>) => {
  if (room.scenePresetId) {
    return normalizeVisualPresetId(room.scenePresetId);
  }

  return typeof room.title === "string" && room.title.includes("酒馆")
    ? "tavern"
    : DEFAULT_VISUAL_PRESET_ID;
};

const normalizeSceneCharacterIds = (
  characterIds: unknown,
  fallbackCharacterIds: string[] = [],
) => {
  const ids = Array.isArray(characterIds)
    ? characterIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallbackCharacterIds;

  return [...new Set(ids)];
};

const numberOrUndefined = (value: unknown) => (
  typeof value === "number" ? value : undefined
);

const pickNumber = (
  inputValue: unknown,
  fallbackValue: unknown,
  defaultValue: number,
) => numberOrUndefined(inputValue) ?? numberOrUndefined(fallbackValue) ?? defaultValue;

const trimmedText = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  return text.length > 0 ? text : undefined;
};

const pickText = (
  inputValue: unknown,
  fallbackValue: unknown,
  defaultValue = "",
) => trimmedText(inputValue) ?? trimmedText(fallbackValue) ?? defaultValue;

const pickValue = <T>(
  inputValue: T | null | undefined,
  fallbackValue: T | null | undefined,
) => inputValue ?? fallbackValue;

const pickNormalizedValue = <T>(
  inputValue: unknown,
  fallbackValue: unknown,
  normalize: (value: unknown) => T | undefined,
) => normalize(inputValue) ?? normalize(fallbackValue);

const pickArray = (inputValue: unknown, fallbackValue: unknown) => {
  if (Array.isArray(inputValue)) {
    return inputValue;
  }

  return Array.isArray(fallbackValue) ? fallbackValue : [];
};

const normalizeItems = <T>(
  items: unknown[],
  normalize: (item: unknown) => T | null | undefined,
) => items
  .map(normalize)
  .filter((item): item is T => Boolean(item));

const pickActiveCharacterId = (
  inputCharacterId: unknown,
  fallbackCharacterId: unknown,
  characterIds: string[],
) => {
  const candidateIds = [inputCharacterId, fallbackCharacterId];
  const matchedId = candidateIds.find((id): id is string =>
    typeof id === "string" && characterIds.includes(id)
  );

  return matchedId ?? characterIds[0] ?? "";
};

export const buildTavernScene = (
  input: TavernSceneInput,
  fallback: Partial<TavernRoom> = {},
): TavernScene => {
  const fallbackScene = fallback as Partial<TavernScene>;
  const timestampNow = now();
  const updatedAt = pickNumber(input.updatedAt, fallback.updatedAt, timestampNow);
  const createdAt = pickNumber(input.createdAt, fallback.createdAt, updatedAt);
  const fallbackCharacterMemories = normalizeStringRecord(fallback.characterMemories);
  const inputCharacterMemories = input.characterMemories === undefined
    ? fallbackCharacterMemories
    : normalizeStringRecord(input.characterMemories);
  const characterConfigs = normalizeRoomCharacterConfigs(
    pickValue(input.characterConfigs, fallback.characterConfigs),
    inputCharacterMemories,
  );
  const characterIds = normalizeSceneCharacterIds(
    input.characterIds,
    Array.isArray(fallback.characterIds) ? fallback.characterIds : [],
  );
  const activeCharacterId = pickActiveCharacterId(
    input.activeCharacterId,
    fallback.activeCharacterId,
    characterIds,
  );
  const previousStatusSnapshotSource = pickValue(
    input.previousStatusSnapshot,
    fallbackScene.previousStatusSnapshot,
  );

  return {
    id: input.id || createId("scene"),
    order: pickNumber(input.order, fallbackScene.order, 0),
    title: trimmedText(input.title) ?? defaultSceneTitle,
    scenePresetId: normalizeVisualPresetId(pickValue(input.scenePresetId, fallback.scenePresetId)),
    scene: pickText(input.scene, fallback.scene, "一张空桌、一盏低灯，以及等待被写下的第一句对白。"),
    sceneGoal: pickText(input.sceneGoal, fallback.sceneGoal),
    plot: pickText(input.plot, fallback.scenePlot),
    storyDirection: pickText(input.storyDirection, fallback.sceneDirection),
    transition: pickText(input.transition, fallback.sceneTransition),
    memory: pickText(input.memory, fallback.memory),
    relationshipOverrides: normalizeSceneRelationshipOverrides(
      pickValue(input.relationshipOverrides, fallbackScene.relationshipOverrides),
      updatedAt,
    ),
    sceneStatus: pickNormalizedValue(
      input.sceneStatus,
      fallbackScene.sceneStatus,
      (value) => normalizeSceneStatus(value, updatedAt),
    ),
    characterPublicStatuses: normalizeCharacterPublicStatuses(
      pickValue(input.characterPublicStatuses, fallbackScene.characterPublicStatuses),
      characterIds,
      undefined,
      updatedAt,
    ),
    characterPrivateStatuses: normalizeCharacterPrivateStatuses(
      pickValue(input.characterPrivateStatuses, fallbackScene.characterPrivateStatuses),
      characterIds,
      undefined,
      updatedAt,
    ),
    pendingInteractions: normalizeItems<TavernPendingInteraction>(
      pickArray(input.pendingInteractions, fallbackScene.pendingInteractions),
      normalizePendingInteraction,
    ),
    replyOptions: normalizeItems<TavernReplyOption>(
      pickArray(input.replyOptions, fallbackScene.replyOptions),
      normalizeReplyOption,
    ),
    factEvents: normalizeFactEvents(
      pickValue(input.factEvents, fallbackScene.factEvents),
    ),
    statusEvents: normalizeStatusEvents(
      pickValue(input.statusEvents, fallbackScene.statusEvents),
    ),
    statusSnapshot: normalizeStatusSnapshot(
      pickValue(input.statusSnapshot, fallbackScene.statusSnapshot),
      updatedAt,
    ),
    previousStatusSnapshot: previousStatusSnapshotSource
      ? normalizeStatusSnapshot(previousStatusSnapshotSource, updatedAt)
      : undefined,
    statusCheckpoints: normalizeProgressCheckpoints(
      pickValue(input.statusCheckpoints, fallbackScene.statusCheckpoints),
    ),
    taskDefinitions: normalizeTaskDefinitions(
      pickValue(input.taskDefinitions, fallbackScene.taskDefinitions),
    ),
    taskEvents: normalizeTaskEvents(
      pickValue(input.taskEvents, fallbackScene.taskEvents),
    ),
    taskSnapshot: normalizeTaskSnapshot(
      pickValue(input.taskSnapshot, fallbackScene.taskSnapshot),
    ),
    sceneOutcomes: normalizeSceneOutcomes(
      pickValue(input.sceneOutcomes, fallbackScene.sceneOutcomes),
    ),
    outcomeEvents: normalizeOutcomeEvents(
      pickValue(input.outcomeEvents, fallbackScene.outcomeEvents),
    ),
    characterConfigs,
    characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
    illustrationHints: normalizeIllustrationHints(
      pickValue(input.illustrationHints, fallbackScene.illustrationHints),
    ),
    assetDrafts: normalizeItems<TavernAssetDraft>(
      pickArray(input.assetDrafts, fallbackScene.assetDrafts),
      normalizeAssetDraft,
    ),
    characterIds,
    activeCharacterId,
    createdAt,
    updatedAt,
  };
};

export const createTavernScene = (
  input: TavernSceneInput = {},
  fallback: Partial<TavernRoom> = {},
): TavernScene => buildTavernScene(input, fallback);
