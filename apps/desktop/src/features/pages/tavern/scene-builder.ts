import {
  DEFAULT_VISUAL_PRESET_ID,
  normalizeVisualPresetId,
} from "./visual-presets";
import {
  createTavernId as createId,
  now,
} from "./ids";
import {
  normalizeStringRecord,
} from "./normalization";
import {
  normalizeAssetDraft,
  normalizeIllustrationHints,
} from "./asset-normalizers";
import {
  normalizeRoomCharacterConfigs,
  roomCharacterMemoriesFromConfigs,
} from "./room-character-configs";
import {
  normalizeSceneRelationshipOverrides,
} from "./relationships";
import {
  normalizeCharacterPrivateStatuses,
  normalizeCharacterPublicStatuses,
  normalizePendingInteraction,
  normalizeReplyOption,
  normalizeSceneStatus,
} from "./scene-state-normalizers";
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
} from "./status-normalizers";
import type {
  TavernAssetDraft,
  TavernPendingInteraction,
  TavernReplyOption,
  TavernRoom,
  TavernScene,
} from "./types";

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

export const buildTavernScene = (
  input: TavernSceneInput,
  fallback: Partial<TavernRoom> = {},
): TavernScene => {
  const updatedAt = typeof input.updatedAt === "number"
    ? input.updatedAt
    : typeof fallback.updatedAt === "number"
    ? fallback.updatedAt
    : now();
  const createdAt = typeof input.createdAt === "number"
    ? input.createdAt
    : typeof fallback.createdAt === "number"
    ? fallback.createdAt
    : updatedAt;
  const fallbackCharacterMemories = normalizeStringRecord(fallback.characterMemories);
  const inputCharacterMemories = input.characterMemories === undefined
    ? fallbackCharacterMemories
    : normalizeStringRecord(input.characterMemories);
  const characterConfigs = normalizeRoomCharacterConfigs(
    input.characterConfigs ?? fallback.characterConfigs,
    inputCharacterMemories,
  );
  const characterIds = normalizeSceneCharacterIds(
    input.characterIds,
    Array.isArray(fallback.characterIds) ? fallback.characterIds : [],
  );
  const activeCharacterId = typeof input.activeCharacterId === "string" &&
      characterIds.includes(input.activeCharacterId)
    ? input.activeCharacterId
    : typeof fallback.activeCharacterId === "string" &&
        characterIds.includes(fallback.activeCharacterId)
    ? fallback.activeCharacterId
    : characterIds[0] ?? "";

  return {
    id: input.id || createId("scene"),
    order: typeof input.order === "number"
      ? input.order
      : typeof (fallback as Partial<TavernScene>).order === "number"
      ? (fallback as Partial<TavernScene>).order ?? 0
      : 0,
    title: input.title?.trim() || defaultSceneTitle,
    scenePresetId: normalizeVisualPresetId(input.scenePresetId ?? fallback.scenePresetId),
    scene: input.scene?.trim() || fallback.scene?.trim() || "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    sceneGoal: input.sceneGoal?.trim() || fallback.sceneGoal?.trim() || "",
    plot: input.plot?.trim() || fallback.scenePlot?.trim() || "",
    storyDirection: input.storyDirection?.trim() || fallback.sceneDirection?.trim() || "",
    transition: input.transition?.trim() || fallback.sceneTransition?.trim() || "",
    memory: input.memory?.trim() || fallback.memory?.trim() || "",
    relationshipOverrides: normalizeSceneRelationshipOverrides(
      input.relationshipOverrides ?? (fallback as Partial<TavernScene>).relationshipOverrides,
      updatedAt,
    ),
    sceneStatus: normalizeSceneStatus(input.sceneStatus, updatedAt) ??
      normalizeSceneStatus((fallback as Partial<TavernScene>).sceneStatus, updatedAt),
    characterPublicStatuses: normalizeCharacterPublicStatuses(
      input.characterPublicStatuses ?? (fallback as Partial<TavernScene>).characterPublicStatuses,
      characterIds,
      undefined,
      updatedAt,
    ),
    characterPrivateStatuses: normalizeCharacterPrivateStatuses(
      input.characterPrivateStatuses ?? (fallback as Partial<TavernScene>).characterPrivateStatuses,
      characterIds,
      undefined,
      updatedAt,
    ),
    pendingInteractions: Array.isArray(input.pendingInteractions)
      ? input.pendingInteractions
          .map(normalizePendingInteraction)
          .filter((interaction): interaction is TavernPendingInteraction => Boolean(interaction))
      : Array.isArray((fallback as Partial<TavernScene>).pendingInteractions)
      ? ((fallback as Partial<TavernScene>).pendingInteractions ?? [])
          .map(normalizePendingInteraction)
          .filter((interaction): interaction is TavernPendingInteraction => Boolean(interaction))
      : [],
    replyOptions: Array.isArray(input.replyOptions)
      ? input.replyOptions
          .map(normalizeReplyOption)
          .filter((option): option is TavernReplyOption => Boolean(option))
      : Array.isArray((fallback as Partial<TavernScene>).replyOptions)
      ? ((fallback as Partial<TavernScene>).replyOptions ?? [])
          .map(normalizeReplyOption)
          .filter((option): option is TavernReplyOption => Boolean(option))
      : [],
    factEvents: normalizeFactEvents(
      input.factEvents ?? (fallback as Partial<TavernScene>).factEvents,
    ),
    statusEvents: normalizeStatusEvents(
      input.statusEvents ?? (fallback as Partial<TavernScene>).statusEvents,
    ),
    statusSnapshot: normalizeStatusSnapshot(
      input.statusSnapshot ?? (fallback as Partial<TavernScene>).statusSnapshot,
      updatedAt,
    ),
    previousStatusSnapshot: (input.previousStatusSnapshot ?? (fallback as Partial<TavernScene>).previousStatusSnapshot)
      ? normalizeStatusSnapshot(
          input.previousStatusSnapshot ?? (fallback as Partial<TavernScene>).previousStatusSnapshot,
          updatedAt,
        )
      : undefined,
    statusCheckpoints: normalizeProgressCheckpoints(
      input.statusCheckpoints ?? (fallback as Partial<TavernScene>).statusCheckpoints,
    ),
    taskDefinitions: normalizeTaskDefinitions(
      input.taskDefinitions ?? (fallback as Partial<TavernScene>).taskDefinitions,
    ),
    taskEvents: normalizeTaskEvents(
      input.taskEvents ?? (fallback as Partial<TavernScene>).taskEvents,
    ),
    taskSnapshot: normalizeTaskSnapshot(
      input.taskSnapshot ?? (fallback as Partial<TavernScene>).taskSnapshot,
    ),
    sceneOutcomes: normalizeSceneOutcomes(
      input.sceneOutcomes ?? (fallback as Partial<TavernScene>).sceneOutcomes,
    ),
    outcomeEvents: normalizeOutcomeEvents(
      input.outcomeEvents ?? (fallback as Partial<TavernScene>).outcomeEvents,
    ),
    characterConfigs,
    characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
    illustrationHints: normalizeIllustrationHints(
      input.illustrationHints ?? (fallback as Partial<TavernScene>).illustrationHints,
    ),
    assetDrafts: Array.isArray(input.assetDrafts)
      ? input.assetDrafts
          .map(normalizeAssetDraft)
          .filter((draft): draft is TavernAssetDraft => Boolean(draft))
      : Array.isArray(fallback.assetDrafts)
      ? fallback.assetDrafts
          .map(normalizeAssetDraft)
          .filter((draft): draft is TavernAssetDraft => Boolean(draft))
      : [],
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
