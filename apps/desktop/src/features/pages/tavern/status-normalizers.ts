import {
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_SCENE_OUTCOMES,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
  DEFAULT_TAVERN_TASK_DEFINITIONS,
} from "./defaults";
import {
  now,
} from "./ids";
import {
  clampInteger,
  normalizeStringArray,
} from "./normalization";
import type {
  TavernFactEvent,
  TavernOutcomeEvent,
  TavernProgressCheckpoint,
  TavernProgressTrackerSettings,
  TavernProgressView,
  TavernSceneOutcomeDefinition,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusRule,
  TavernStatusSnapshot,
  TavernTaskDefinition,
  TavernTaskEvent,
  TavernTaskState,
} from "./types";

export const normalizeStatusValue = (value: unknown): string | number | boolean | string[] | null => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return normalizeStringArray(value);
};

const createEmptyStatusSnapshot = (
  turnId = "initial",
  updatedAt = now(),
): TavernStatusSnapshot => ({
  turnId,
  global: {},
  scene: {},
  parties: {},
  characters: {},
  relationships: {},
  updatedAt,
});

const normalizeStatusValueRecord = (value: unknown): Record<string, string | number | boolean | string[] | null> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizeStatusValue(item),
    ]),
  );
};

const normalizeNestedStatusValueRecord = (
  value: unknown,
): Record<string, Record<string, string | number | boolean | string[] | null>> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizeStatusValueRecord(item),
    ]),
  );
};

export const normalizeStatusSnapshot = (
  value: unknown,
  updatedAt: number,
  fallbackTurnId = "initial",
): TavernStatusSnapshot => {
  if (!value || typeof value !== "object") {
    return createEmptyStatusSnapshot(fallbackTurnId, updatedAt);
  }

  const candidate = value as Partial<TavernStatusSnapshot>;
  return {
    turnId: typeof candidate.turnId === "string" && candidate.turnId.trim()
      ? candidate.turnId
      : fallbackTurnId,
    global: normalizeStatusValueRecord(candidate.global),
    scene: normalizeStatusValueRecord(candidate.scene),
    parties: normalizeNestedStatusValueRecord(candidate.parties),
    characters: normalizeNestedStatusValueRecord(candidate.characters),
    relationships: normalizeNestedStatusValueRecord(candidate.relationships),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
  };
};

export const normalizeStatusDefinitions = (
  value: unknown,
  fallback: TavernStatusDefinition[] = DEFAULT_TAVERN_STATUS_DEFINITIONS,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.flatMap((item): TavernStatusDefinition[] => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<TavernStatusDefinition>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (!id || !label) {
      return [];
    }

    return [{
      ...candidate,
      id,
      label,
      scope: candidate.scope === "global" ||
          candidate.scope === "scene" ||
          candidate.scope === "party" ||
          candidate.scope === "character" ||
          candidate.scope === "relationship"
        ? candidate.scope
        : "scene",
      valueType: candidate.valueType === "number" ||
          candidate.valueType === "text" ||
          candidate.valueType === "enum" ||
          candidate.valueType === "boolean" ||
          candidate.valueType === "tags"
        ? candidate.valueType
        : "text",
      defaultValue: normalizeStatusValue(candidate.defaultValue),
      visibility: candidate.visibility ?? "public",
      updatePolicy: {
        mode: candidate.updatePolicy?.mode ?? "manualOnly",
        requireFactEvent: Boolean(candidate.updatePolicy?.requireFactEvent),
        allowedEventTypes: Array.isArray(candidate.updatePolicy?.allowedEventTypes)
          ? candidate.updatePolicy.allowedEventTypes
          : undefined,
        maxDeltaPerTurn: typeof candidate.updatePolicy?.maxDeltaPerTurn === "number"
          ? candidate.updatePolicy.maxDeltaPerTurn
          : undefined,
        confidenceThreshold: typeof candidate.updatePolicy?.confidenceThreshold === "number"
          ? candidate.updatePolicy.confidenceThreshold
          : undefined,
        manualReviewAboveDelta: typeof candidate.updatePolicy?.manualReviewAboveDelta === "number"
          ? candidate.updatePolicy.manualReviewAboveDelta
          : undefined,
      },
    }];
  });
};

export const normalizeStatusRules = (
  value: unknown,
  fallback: TavernStatusRule[] = DEFAULT_TAVERN_STATUS_RULES,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernStatusRule =>
    Boolean(
      item &&
      typeof item === "object" &&
      typeof (item as Partial<TavernStatusRule>).id === "string" &&
      typeof (item as Partial<TavernStatusRule>).label === "string" &&
      (item as Partial<TavernStatusRule>).when &&
      (item as Partial<TavernStatusRule>).apply,
    )
  );
};

export const normalizeProgressViews = (
  value: unknown,
  fallback: TavernProgressView[] = DEFAULT_TAVERN_PROGRESS_VIEWS,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernProgressView =>
    Boolean(
      item &&
      typeof item === "object" &&
      typeof (item as Partial<TavernProgressView>).id === "string" &&
      typeof (item as Partial<TavernProgressView>).label === "string" &&
      Array.isArray((item as Partial<TavernProgressView>).items),
    )
  );
};

export const normalizeProgressTracker = (value: unknown): TavernProgressTrackerSettings => {
  const candidate = value && typeof value === "object"
    ? value as Partial<TavernProgressTrackerSettings>
    : {};
  return {
    enabled: Boolean(candidate.enabled),
    mode: candidate.mode === "afterTurn" || candidate.mode === "fixedTurns"
      ? candidate.mode
      : "manual",
    intervalTurns: clampInteger(candidate.intervalTurns, DEFAULT_TAVERN_PROGRESS_TRACKER.intervalTurns, 1, 50),
    applyMode: candidate.applyMode === "auto" ? "auto" : "review",
    factConfidenceThreshold: typeof candidate.factConfidenceThreshold === "number"
      ? Math.min(1, Math.max(0, candidate.factConfidenceThreshold))
      : DEFAULT_TAVERN_PROGRESS_TRACKER.factConfidenceThreshold,
    generateCheckpointBeforeContextTrim: candidate.generateCheckpointBeforeContextTrim !== false,
  };
};

export const normalizeFactEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernFactEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernFactEvent>).id === "string")
    )
  : [];

export const normalizeStatusEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernStatusEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernStatusEvent>).id === "string")
    )
  : [];

export const normalizeTaskDefinitions = (
  value: unknown,
  fallback: TavernTaskDefinition[] = DEFAULT_TAVERN_TASK_DEFINITIONS,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernTaskDefinition =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernTaskDefinition>).id === "string")
    );
};

export const normalizeTaskEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernTaskEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernTaskEvent>).id === "string")
    )
  : [];

export const normalizeTaskSnapshot = (value: unknown): Record<string, TavernTaskState> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => (
      item && typeof item === "object"
        ? [[key, item as TavernTaskState]]
        : []
    )),
  );
};

export const normalizeSceneOutcomes = (
  value: unknown,
  fallback: TavernSceneOutcomeDefinition[] = DEFAULT_TAVERN_SCENE_OUTCOMES,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernSceneOutcomeDefinition =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernSceneOutcomeDefinition>).id === "string")
    );
};

export const normalizeOutcomeEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernOutcomeEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernOutcomeEvent>).id === "string")
    )
  : [];

export const normalizeProgressCheckpoints = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item): TavernProgressCheckpoint[] => {
      if (!item || typeof item !== "object" || typeof (item as Partial<TavernProgressCheckpoint>).id !== "string") {
        return [];
      }

      const checkpoint = item as Partial<TavernProgressCheckpoint>;
      const id = (item as { id: string }).id;
      return [{
        id,
        turnId: typeof checkpoint.turnId === "string" ? checkpoint.turnId : "unknown",
        statusSnapshot: normalizeStatusSnapshot(checkpoint.statusSnapshot, Date.now()),
        taskSnapshot: normalizeTaskSnapshot(checkpoint.taskSnapshot),
        includedFactEventIds: normalizeStringArray(checkpoint.includedFactEventIds),
        includedStatusEventIds: normalizeStringArray(checkpoint.includedStatusEventIds),
        includedTaskEventIds: normalizeStringArray(checkpoint.includedTaskEventIds),
        includedOutcomeEventIds: normalizeStringArray(checkpoint.includedOutcomeEventIds),
        reason: checkpoint.reason === "initial" ||
          checkpoint.reason === "after_turn" ||
          checkpoint.reason === "before_context_trim" ||
          checkpoint.reason === "manual" ||
          checkpoint.reason === "compaction" ||
          checkpoint.reason === "rebuild"
          ? checkpoint.reason
          : "manual",
        createdAt: typeof checkpoint.createdAt === "number" ? checkpoint.createdAt : Date.now(),
      }];
    })
  : [];
