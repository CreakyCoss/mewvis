import { projectTavernSceneOntoRoom, syncTavernRoomActiveScene } from "../../../active-scene-runtime";
import {
  cloneTavernRuntimeStoryProjectionFields,
} from "../../../adapters/story";
import type {
  TavernCharacter,
  TavernCondition,
  TavernProgressView,
  TavernReplyMode,
  TavernRoleAssignmentDefinition,
  TavernRoom,
  TavernRoomCharacterConfig,
  TavernRoomSettings,
  TavernSceneOutcomeDefinition,
  TavernStatusDefinition,
  TavernStatusRule,
  TavernTaskDefinition,
} from "../../../types";

export const replyModeOptions: Array<{
  value: TavernReplyMode;
  label: string;
}> = [
  { value: "active", label: "当前角色" },
  { value: "round", label: "全员轮流" },
  { value: "director", label: "导演调度" },
];

export const formatCount = (value: number, label: string) => `${value} ${label}`;

export const emptyValueText = "未设置";

export const getRoomCharacterById = (
  room: Pick<TavernRoom, "localCharacters"> | null,
  characterById: Map<string, TavernCharacter>,
) => {
  const roomCharacterById = new Map(characterById);
  (room?.localCharacters ?? []).forEach((character) => {
    roomCharacterById.set(character.id, character);
  });
  return roomCharacterById;
};

export const getRoomCharacters = (
  room: Pick<TavernRoom, "characterIds">,
  roomCharacterById: Map<string, TavernCharacter>,
) => room.characterIds
  .map((characterId) => roomCharacterById.get(characterId))
  .filter((character): character is TavernCharacter => Boolean(character));

export const getActiveTaskCount = (room: Pick<TavernRoom, "taskSnapshot">) =>
  Object.values(room.taskSnapshot).filter((task) => task.status !== "inactive").length;

export const getOutcomeEventCount = (room: Pick<TavernRoom, "outcomeEvents">) =>
  room.outcomeEvents.filter((event) => event.status !== "dismissed").length;

export const getStatusEventCounts = (room: Pick<TavernRoom, "statusEvents">) => ({
  applied: room.statusEvents.filter((event) => event.status === "applied").length,
  pending: room.statusEvents.filter((event) => event.status === "pending").length,
});

export const getProgressPlacementText = (room: Pick<TavernRoom, "progressViews">) =>
  Array.from(new Set(room.progressViews.map((view) => view.placement))).join("、");

export const getUnknownErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "操作失败，请稍后重试。";
};

export const parseKeywords = (value: string) =>
  value.split(/[,，\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

export const cloneRoomCharacterConfigs = (
  configs: Record<string, TavernRoomCharacterConfig> | undefined,
): Record<string, TavernRoomCharacterConfig> => Object.fromEntries(
  Object.entries(configs ?? {}).map(([characterId, config]) => [
    characterId,
    {
      ...config,
    },
  ]),
);

export const characterMemoriesFromConfigs = (
  configs: Record<string, TavernRoomCharacterConfig>,
) => Object.fromEntries(
  Object.entries(configs).flatMap(([characterId, config]) => {
    const memory = config.memory?.trim() ?? "";
    return memory ? [[characterId, memory]] : [];
  }),
);

export const editorControlClassName = "w-full bg-background/80 shadow-none";
export const settingsFlagGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-2";
export const settingsEditorMetricGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3";

export const focusRoomEditorElementById = (
  elementId: string | undefined,
  delayMs = 80,
) => {
  if (!elementId || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.setTimeout(() => {
    const element = document.getElementById(elementId) as HTMLElement | null;
    if (!element) {
      return;
    }

    element.scrollIntoView({ block: "center", behavior: "smooth" });
    window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
    });
  }, delayMs);
};

export const getReplyModeLabel = (replyMode: TavernReplyMode) =>
  replyModeOptions.find((option) => option.value === replyMode)?.label ?? "当前角色";

type ProgressJsonParseResult<T> =
  | { ok: true; value: T[] }
  | { ok: false; error: string };

export const formatProgressJson = (value: unknown) => JSON.stringify(value, null, 2);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const hasStringField = (value: Record<string, unknown>, field: string) =>
  typeof value[field] === "string" && value[field].trim().length > 0;

const hasRecordField = (value: Record<string, unknown>, field: string) =>
  isRecord(value[field]);

export const parseProgressJsonArray = <T,>(
  raw: string,
  label: string,
  guard: (item: unknown) => item is T,
): ProgressJsonParseResult<T> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `${label}不是有效 JSON。` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: `${label}必须是数组。` };
  }

  const invalidIndex = parsed.findIndex((item) => !guard(item));
  if (invalidIndex >= 0) {
    return { ok: false, error: `${label}第 ${invalidIndex + 1} 项缺少必要字段。` };
  }

  const seenIds = new Set<string>();
  const duplicatedItem = parsed.find((item) => {
    const id = isRecord(item) && typeof item.id === "string" ? item.id.trim() : "";
    if (!id) {
      return false;
    }
    if (seenIds.has(id)) {
      return true;
    }
    seenIds.add(id);
    return false;
  });
  if (duplicatedItem && isRecord(duplicatedItem) && typeof duplicatedItem.id === "string") {
    return { ok: false, error: `${label}存在重复 id：${duplicatedItem.id}` };
  }

  return { ok: true, value: parsed };
};

export const isStatusDefinitionDraft = (item: unknown): item is TavernStatusDefinition => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasStringField(item, "scope") &&
  hasStringField(item, "valueType") &&
  hasStringField(item, "visibility") &&
  hasRecordField(item, "updatePolicy")
);

export const isStatusRuleDraft = (item: unknown): item is TavernStatusRule => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasRecordField(item, "when") &&
  hasRecordField(item, "apply")
);

export const isProgressViewDraft = (item: unknown): item is TavernProgressView => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasStringField(item, "kind") &&
  hasStringField(item, "placement") &&
  hasStringField(item, "ownerBinding") &&
  hasStringField(item, "layout") &&
  Array.isArray(item.items)
);

export const isRoleAssignmentDefinitionDraft = (item: unknown): item is TavernRoleAssignmentDefinition => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  (item.count === undefined || typeof item.count === "number")
);

export const isTaskDefinitionDraft = (item: unknown): item is TavernTaskDefinition => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "title") &&
  hasStringField(item, "scope") &&
  hasRecordField(item, "owner") &&
  hasStringField(item, "visibility") &&
  typeof item.required === "boolean" &&
  typeof item.optional === "boolean" &&
  typeof item.repeatable === "boolean" &&
  hasRecordField(item, "lifecycle") &&
  isRecord(item.lifecycle) &&
  hasStringField(item.lifecycle, "initialStatus") &&
  hasRecordField(item.lifecycle, "completeCondition")
);

export const isSceneOutcomeDraft = (item: unknown): item is TavernSceneOutcomeDefinition => (
  isRecord(item) &&
  hasStringField(item, "id") &&
  hasStringField(item, "label") &&
  hasRecordField(item, "condition") &&
  typeof item.priority === "number" &&
  typeof item.exclusive === "boolean" &&
  hasStringField(item, "endScene") &&
  hasStringField(item, "visibility")
);

const collectConditionRefs = (
  condition: TavernCondition | undefined,
  refs: { statusIds: Set<string>; taskIds: Set<string> },
) => {
  if (!condition) {
    return;
  }
  if ("all" in condition) {
    condition.all.forEach((item) => collectConditionRefs(item, refs));
    return;
  }
  if ("any" in condition) {
    condition.any.forEach((item) => collectConditionRefs(item, refs));
    return;
  }
  if ("not" in condition) {
    collectConditionRefs(condition.not, refs);
    return;
  }
  if ("status" in condition) {
    if (typeof condition.status === "string") {
      refs.statusIds.add(condition.status);
    }
    return;
  }
  if ("task" in condition) {
    if (typeof condition.task === "string") {
      refs.taskIds.add(condition.task);
    }
  }
};

export const validateProgressConfigReferences = ({
  statusDefinitions,
  statusRules,
  progressViews,
  taskDefinitions,
  sceneOutcomes,
}: {
  statusDefinitions: TavernStatusDefinition[];
  statusRules: TavernStatusRule[];
  progressViews: TavernProgressView[];
  taskDefinitions: TavernTaskDefinition[];
  sceneOutcomes: TavernSceneOutcomeDefinition[];
}) => {
  const statusIds = new Set(statusDefinitions.map((definition) => definition.id));
  const taskIds = new Set(taskDefinitions.map((task) => task.id));
  const outcomeIds = new Set(sceneOutcomes.map((outcome) => outcome.id));

  const invalidRule = statusRules.find((rule) => !statusIds.has(rule.apply.statusId));
  if (invalidRule) {
    return `状态规则「${invalidRule.label}」引用了不存在的状态：${invalidRule.apply.statusId}`;
  }

  for (const view of progressViews) {
    for (const item of view.items) {
      if (item.type === "status" && !statusIds.has(item.statusId)) {
        return `状态面板「${view.label}」引用了不存在的状态：${item.statusId}`;
      }
      if (item.type === "task" && !taskIds.has(item.taskId)) {
        return `状态面板「${view.label}」引用了不存在的任务：${item.taskId}`;
      }
      if (item.type === "outcome" && !outcomeIds.has(item.outcomeId)) {
        return `状态面板「${view.label}」引用了不存在的结局：${item.outcomeId}`;
      }
    }
  }

  for (const task of taskDefinitions) {
    const refs = { statusIds: new Set<string>(), taskIds: new Set<string>() };
    collectConditionRefs(task.lifecycle.startCondition, refs);
    collectConditionRefs(task.lifecycle.completeCondition, refs);
    collectConditionRefs(task.lifecycle.failCondition, refs);
    const missingStatusId = Array.from(refs.statusIds).find((statusId) => !statusIds.has(statusId));
    if (missingStatusId) {
      return `任务「${task.title}」引用了不存在的状态：${missingStatusId}`;
    }
    const missingTaskId = Array.from(refs.taskIds).find((taskId) => !taskIds.has(taskId));
    if (missingTaskId) {
      return `任务「${task.title}」引用了不存在的任务：${missingTaskId}`;
    }
  }

  for (const outcome of sceneOutcomes) {
    const refs = { statusIds: new Set<string>(), taskIds: new Set<string>() };
    collectConditionRefs(outcome.condition, refs);
    const missingStatusId = Array.from(refs.statusIds).find((statusId) => !statusIds.has(statusId));
    if (missingStatusId) {
      return `结局「${outcome.label}」引用了不存在的状态：${missingStatusId}`;
    }
    const missingTaskId = Array.from(refs.taskIds).find((taskId) => !taskIds.has(taskId));
    if (missingTaskId) {
      return `结局「${outcome.label}」引用了不存在的任务：${missingTaskId}`;
    }
  }

  return "";
};

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "未知错误";
};

const cloneTavernDirectorProfile = (
  profile: TavernRoomSettings["directorScheduling"]["profile"],
): TavernRoomSettings["directorScheduling"]["profile"] => profile
  ? {
      ...profile,
      globalGoals: [...profile.globalGoals],
      globalRules: [...profile.globalRules],
      characterProfiles: Object.fromEntries(
        Object.entries(profile.characterProfiles).map(([characterId, characterProfile]) => [
          characterId,
          {
            ...characterProfile,
            interestTags: [...characterProfile.interestTags],
            goalTags: [...characterProfile.goalTags],
            knowledgeTags: [...characterProfile.knowledgeTags],
            speechTriggers: [...characterProfile.speechTriggers],
            silenceTriggers: [...characterProfile.silenceTriggers],
          },
        ]),
      ),
    }
  : undefined;

export const cloneTavernRoomSettings = (settings: TavernRoomSettings): TavernRoomSettings => ({
  ...settings,
  interactionQualityRuleIds: [...settings.interactionQualityRuleIds],
  directorNarrativeControl: { ...settings.directorNarrativeControl },
  continuation: { ...settings.continuation },
  replyOptions: { ...settings.replyOptions },
  statusTracking: { ...settings.statusTracking },
  randomEvents: { ...settings.randomEvents },
  illustrationHints: { ...settings.illustrationHints },
  directorScheduling: {
    ...settings.directorScheduling,
    directorOnlyPhaseValues: [...settings.directorScheduling.directorOnlyPhaseValues],
    speakerMotivation: {
      ...settings.directorScheduling.speakerMotivation,
      rules: settings.directorScheduling.speakerMotivation.rules.map((rule) => ({ ...rule })),
    },
    profile: cloneTavernDirectorProfile(settings.directorScheduling.profile),
    fixedOrder: {
      ...settings.directorScheduling.fixedOrder,
      phaseValues: [...settings.directorScheduling.fixedOrder.phaseValues],
    },
  },
  informationPolicy: {
    ...settings.informationPolicy,
    hiddenFacts: { ...settings.informationPolicy.hiddenFacts },
    roleAssignment: {
      ...settings.informationPolicy.roleAssignment,
      opening: {
        ...settings.informationPolicy.roleAssignment.opening,
        globalStatusPatches: settings.informationPolicy.roleAssignment.opening.globalStatusPatches.map((patch) => ({
          ...patch,
        })),
      },
      rolePool: settings.informationPolicy.roleAssignment.rolePool.map((role) => ({ ...role })),
    },
  },
});

export const cloneTavernRoom = (room: TavernRoom): TavernRoom => ({
  ...room,
  settings: cloneTavernRoomSettings(room.settings),
  ...cloneTavernRuntimeStoryProjectionFields(room),
  characterConfigs: cloneRoomCharacterConfigs(room.characterConfigs),
  characterMemories: { ...room.characterMemories },
  scenes: room.scenes?.map((scene) => ({
    ...scene,
    characterConfigs: cloneRoomCharacterConfigs(scene.characterConfigs),
    characterMemories: { ...scene.characterMemories },
    characterIds: [...scene.characterIds],
    assetDrafts: scene.assetDrafts.map((draft) => ({
      ...draft,
      sourceMessageIds: [...draft.sourceMessageIds],
      characterMemories: draft.characterMemories.map((memory) => ({ ...memory })),
      lorebookEntries: draft.lorebookEntries.map((entry) => ({
        ...entry,
        keywords: [...entry.keywords],
      })),
    })),
    illustrationHints: scene.illustrationHints.map((hint) => ({
      ...hint,
      sourceMessageIds: [...hint.sourceMessageIds],
    })),
  })) ?? [],
  assetDrafts: room.assetDrafts.map((draft) => ({
    ...draft,
    sourceMessageIds: [...draft.sourceMessageIds],
    characterMemories: draft.characterMemories.map((memory) => ({ ...memory })),
    lorebookEntries: draft.lorebookEntries.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
    })),
  })),
  illustrationHints: room.illustrationHints.map((hint) => ({
    ...hint,
    sourceMessageIds: [...hint.sourceMessageIds],
  })),
});

export const prepareTavernRoomForSave = (room: TavernRoom): TavernRoom => {
  const characterConfigs = cloneRoomCharacterConfigs(room.characterConfigs);
  const characterMemories = characterMemoriesFromConfigs(characterConfigs);
  const storyProjectionFields = cloneTavernRuntimeStoryProjectionFields(room);
  const scenes = room.scenes?.map((scene) => {
    const sceneCharacterConfigs = cloneRoomCharacterConfigs(scene.characterConfigs);

    return {
      ...scene,
      characterConfigs: sceneCharacterConfigs,
      characterMemories: characterMemoriesFromConfigs(sceneCharacterConfigs),
    };
  });

  const syncedRoom = syncTavernRoomActiveScene({
    ...room,
    scenes,
    characterConfigs,
    characterMemories,
    localCharacters: storyProjectionFields.localCharacters,
  });

  return projectTavernSceneOntoRoom({
    ...syncedRoom,
    scenes: (syncedRoom.scenes ?? []).map((scene, index) => ({
      ...scene,
      order: index,
    })),
  });
};

export const applyInformationPolicyModePreset = (
  mode: TavernRoomSettings["informationPolicy"]["mode"],
  current: TavernRoomSettings["informationPolicy"],
): TavernRoomSettings["informationPolicy"] => {
  if (mode === "open") {
    return {
      ...current,
      mode,
      uiDefaultView: "reveal",
      hideCharacterThoughts: false,
      revealThoughts: "manual",
      hiddenFacts: {
        ...current.hiddenFacts,
        enabled: false,
        reveal: "manual",
      },
      roleAssignment: {
        ...current.roleAssignment,
        enabled: false,
        strategy: "manual",
        rolePool: current.roleAssignment.rolePool.map((role) => ({ ...role })),
      },
    };
  }

  return {
    ...current,
    mode,
    uiDefaultView: "public",
    hideCharacterThoughts: true,
    revealThoughts: "sceneOutcome",
    hiddenFacts: {
      ...current.hiddenFacts,
      enabled: true,
      defaultVisibility: "director",
      reveal: "sceneOutcome",
    },
    roleAssignment: {
      ...current.roleAssignment,
      enabled: mode === "social_deduction" ? true : current.roleAssignment.enabled,
      strategy: mode === "social_deduction" ? "director_random" : current.roleAssignment.strategy,
      includeUser: mode === "social_deduction" ? true : current.roleAssignment.includeUser,
      rolePool: current.roleAssignment.rolePool.map((role) => ({ ...role })),
    },
  };
};
