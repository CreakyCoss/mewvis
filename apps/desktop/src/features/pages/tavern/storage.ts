import { invoke, isTauri } from "@tauri-apps/api/core";
import { normalizeTavernAvatarId } from "@/assets/agent-avatars";
import {
  DEFAULT_VISUAL_PRESET_ID,
  normalizeVisualPresetId,
} from "@/features/pages/tavern/visual-presets";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCharacterRelationship,
  TavernCondition,
  TavernEntityRef,
  TavernLorebookEntry,
  TavernMessage,
  TavernMemoryEntry,
  TavernFactEvent,
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernGeneratedPresetScene,
  TavernPendingInteraction,
  TavernCharacterMemoryLayers,
  TavernProgressAction,
  TavernReplyMode,
  TavernReplyOption,
  TavernRelationshipTarget,
  TavernRoom,
  TavernRoomCharacterConfig,
  TavernSceneRelationshipOverride,
  TavernSceneOutcomeDefinition,
  TavernScene,
  TavernSceneInstance,
  TavernSceneMemoryLayers,
  TavernScenePromptOverrides,
  TavernSecretReveal,
  TavernRoomSettings,
  TavernState,
  TavernStatusEvent,
  TavernStatusSnapshot,
  TavernStatusTargetRef,
  TavernTaskDefinition,
} from "./types";
import {
  materializeTavernMessage,
} from "./message";
import {
  normalizeTavernPromptStyleId,
} from "./prompt-styles";
import {
  DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  normalizeTavernSystemNarrativePresetSettings,
} from "./prompt-registry/system-narrative-styles";
import {
  DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  normalizeTavernQualityRuleIds,
  normalizeTavernRuleCompositionId,
} from "./prompt-registry/rule-layers/resolver";
import {
  createDefaultTavernPresentation,
} from "./prompt-registry/presentation-rules";
import {
  createDefaultTavernPromptSettings,
  normalizeTavernPromptSettings,
} from "./prompt-registry/text-blocks";
import {
  createTavernId as createId,
  now,
} from "./ids";
import {
  createDefaultPromptForPresentation,
  normalizeRoomPresentation,
} from "./presentation-settings";
import {
  collectUniqueTrimmedLines,
  formatTavernMemoryBlocks,
  getTavernBranchPathInstances,
  getTavernBranchSecretReveals,
  resolveCharacterMemoryEntryText,
  resolveSceneMemoryEntryText,
} from "./branch-memory";
import {
  normalizeStringRecord,
} from "./normalization";
import {
  cloneDefaultRoomSettings,
  normalizeRoomSettings,
} from "./room-settings";
import {
  normalizeCharacterRelationships,
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
  normalizeAssetDraft,
  normalizeCharacterMemoryDraftVisibility,
  normalizeIllustrationHints,
  normalizeLorebookEntry,
  normalizeLorebookKeywords,
  normalizeSceneMemoryDraftVisibility,
} from "./asset-normalizers";
import {
  normalizeFactEvents,
  normalizeOutcomeEvents,
  normalizeProgressCheckpoints,
  normalizeProgressTracker,
  normalizeProgressViews,
  normalizeSceneOutcomes,
  normalizeStatusDefinitions,
  normalizeStatusEvents,
  normalizeStatusRules,
  normalizeStatusSnapshot,
  normalizeTaskDefinitions,
  normalizeTaskEvents,
  normalizeTaskSnapshot,
} from "./status-normalizers";
import {
  buildStoryRunsFromGraph,
  createRouteScopedSceneInstanceId,
  resolveActiveRun,
  resolveRunNodePrefix,
} from "./story-runtime";
import {
  createDefaultStoryGraph,
  normalizeStoryGraph,
} from "./story-graph";
import {
  createTavernStoryBinding,
  normalizeTavernStoryBinding,
} from "./story-binding";
import {
  createEmptyCharacterMemoryLayers,
  createEmptySceneMemoryLayers,
} from "./memory-layers";
import {
  normalizeScenePromptOverrides,
} from "./scene-prompt-overrides";
import {
  buildSceneInstancesForRuns,
  resolveActiveSceneInstance,
} from "./scene-instances";
import {
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
} from "./defaults";
import {
  getTavernSceneInstanceDisplayTitle,
} from "./scene-selectors";
import {
  getTavernSystemPreset,
  normalizeSystemPresetCharacterId,
  normalizeSystemPresetId,
  tavernSystemPresets,
} from "./system-preset-registry";
import type {
  TavernSystemPresetCharacter,
  TavernSystemPresetRoom,
  TavernSystemPresetScene,
} from "./system-preset-registry";

export {
  getActiveTavernScene,
  getActiveTavernStoryNode,
  getTavernSceneDisplayTitle,
  getTavernSceneInstanceDisplayTitle,
} from "./scene-selectors";
export {
  createTavernMessage,
} from "./message";
export {
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_ROOM_SETTINGS,
  DEFAULT_TAVERN_SCENE_OUTCOMES,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
  DEFAULT_TAVERN_TASK_DEFINITIONS,
} from "./defaults";
export {
  createTavernAssetDraft,
  createTavernIllustrationHint,
  createTavernLorebookEntry,
} from "./asset-factories";
export {
  getTavernSystemPreset,
  tavernSystemPresets,
} from "./system-preset-registry";
export type {
  TavernSystemPreset,
} from "./system-preset-registry";

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const createTavernCharacterFromSystemPresetCharacter = (
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

const defaultSceneTitle = "默认场景";

const normalizeReplyMode = (value: unknown): TavernReplyMode =>
  value === "round" || value === "director" ? value : "active";

const normalizeRoomScenePresetId = (room: Partial<TavernRoom>) => {
  if (room.scenePresetId) {
    return normalizeVisualPresetId(room.scenePresetId);
  }

  return typeof room.title === "string" && room.title.includes("酒馆")
    ? "tavern"
    : DEFAULT_VISUAL_PRESET_ID;
};

const normalizeRoomCharacterConfigs = (
  value: unknown,
  fallbackMemories: Record<string, string> = {},
): Record<string, TavernRoomCharacterConfig> => {
  const configs: Record<string, TavernRoomCharacterConfig> = {};

  for (const [characterId, memory] of Object.entries(fallbackMemories)) {
    if (!characterId) {
      continue;
    }

    configs[characterId] = {
      characterId,
      memory: memory.trim() || undefined,
    };
  }

  if (!value || typeof value !== "object") {
    return configs;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key || !item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Partial<TavernRoomCharacterConfig>;
    const characterId = typeof candidate.characterId === "string"
      ? candidate.characterId.trim()
      : key;
    if (!characterId) {
      continue;
    }

    const memory = typeof candidate.memory === "string"
      ? candidate.memory.trim()
      : configs[characterId]?.memory ?? fallbackMemories[characterId]?.trim() ?? "";
    configs[characterId] = {
      characterId,
      memory: memory || undefined,
    };
  }

  return configs;
};

const roomCharacterMemoriesFromConfigs = (
  configs: Record<string, TavernRoomCharacterConfig>,
) => Object.fromEntries(
  Object.entries(configs).flatMap(([characterId, config]) => {
    const memory = config.memory?.trim() ?? "";
    return memory ? [[characterId, memory]] : [];
  }),
);

const normalizeTavernCharacter = (
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

type TavernCharacterIdMapper = (characterId: string) => string | undefined;

const mapCharacterId = (
  characterId: string,
  mapper: TavernCharacterIdMapper,
) => mapper(characterId) ?? characterId;

const mapTavernRelationshipTarget = (
  target: TavernRelationshipTarget,
  mapper: TavernCharacterIdMapper,
): TavernRelationshipTarget => target.type === "character"
  ? {
      type: "character",
      characterId: mapCharacterId(target.characterId, mapper),
    }
  : target;

const mapTavernCharacterRelationships = (
  relationships: TavernCharacterRelationship[] | undefined,
  mapper: TavernCharacterIdMapper,
): TavernCharacterRelationship[] => (relationships ?? []).map((relationship) => ({
  ...relationship,
  target: mapTavernRelationshipTarget(relationship.target, mapper),
}));

const mapTavernSceneRelationshipOverrides = (
  overrides: TavernSceneRelationshipOverride[] | undefined,
  mapper: TavernCharacterIdMapper,
): TavernSceneRelationshipOverride[] => (overrides ?? []).map((override) => ({
  ...override,
  subjectCharacterId: mapCharacterId(override.subjectCharacterId, mapper),
  target: mapTavernRelationshipTarget(override.target, mapper),
}));

const tavernEntityRefKey = (entity: TavernEntityRef): string => {
  switch (entity.type) {
    case "user":
      return `user:${entity.userId}`;
    case "character":
      return `character:${entity.characterId}`;
    case "team":
      return `team:${entity.teamId}`;
    case "faction":
      return `faction:${entity.factionId}`;
    case "party":
      return `party:${entity.partyId}`;
    case "scene":
      return `scene:${entity.sceneId}`;
    case "global":
      return "global";
  }
};

const tavernRelationshipStatusKey = (
  subject: TavernEntityRef,
  object: TavernEntityRef,
) => `relationship:${tavernEntityRefKey(subject)}->${tavernEntityRefKey(object)}`;

const parseTavernEntityRefKey = (value: string): TavernEntityRef | null => {
  if (value === "global") {
    return { type: "global" };
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const type = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (!id) {
    return null;
  }
  switch (type) {
    case "user":
      return id === "user" ? { type: "user", userId: "user" } : null;
    case "character":
      return { type: "character", characterId: id };
    case "team":
      return { type: "team", teamId: id };
    case "faction":
      return { type: "faction", factionId: id };
    case "party":
      return { type: "party", partyId: id };
    case "scene":
      return { type: "scene", sceneId: id };
    default:
      return null;
  }
};

const parseTavernRelationshipStatusKey = (value: string) => {
  if (!value.startsWith("relationship:")) {
    return null;
  }
  const rawPair = value.slice("relationship:".length);
  const separatorIndex = rawPair.indexOf("->");
  if (separatorIndex <= 0) {
    return null;
  }
  const subject = parseTavernEntityRefKey(rawPair.slice(0, separatorIndex));
  const object = parseTavernEntityRefKey(rawPair.slice(separatorIndex + 2));
  return subject && object ? { subject, object } : null;
};

const mapTavernEntityRef = (
  entity: TavernEntityRef,
  mapper: TavernCharacterIdMapper,
): TavernEntityRef => {
  if (entity.type === "character") {
    return {
      type: "character",
      characterId: mapCharacterId(entity.characterId, mapper),
    };
  }
  return entity;
};

const mapTavernStatusTargetRef = (
  target: TavernStatusTargetRef,
  mapper: TavernCharacterIdMapper,
): TavernStatusTargetRef => {
  if (target.type === "character") {
    return {
      type: "character",
      characterId: mapCharacterId(target.characterId, mapper),
    };
  }
  if (target.type === "relationship") {
    return {
      type: "relationship",
      subject: mapTavernEntityRef(target.subject, mapper),
      object: mapTavernEntityRef(target.object, mapper),
    };
  }
  return target;
};

const mapTavernCondition = (
  condition: TavernCondition,
  mapper: TavernCharacterIdMapper,
): TavernCondition => {
  if ("all" in condition) {
    return { ...condition, all: condition.all.map((item) => mapTavernCondition(item, mapper)) };
  }
  if ("any" in condition) {
    return { ...condition, any: condition.any.map((item) => mapTavernCondition(item, mapper)) };
  }
  if ("not" in condition) {
    return { ...condition, not: mapTavernCondition(condition.not, mapper) };
  }
  if ("status" in condition && "target" in condition) {
    return {
      ...condition,
      target: mapTavernStatusTargetRef(condition.target, mapper),
    };
  }
  if ("factEvent" in condition) {
    return {
      ...condition,
      ...(condition.actor ? { actor: mapTavernEntityRef(condition.actor, mapper) } : {}),
      ...(condition.target ? { target: mapTavernEntityRef(condition.target, mapper) } : {}),
    };
  }
  if ("task" in condition) {
    return {
      ...condition,
      ...(condition.owner ? { owner: mapTavernEntityRef(condition.owner, mapper) } : {}),
    };
  }
  return condition;
};

const mapTavernReplyOption = (
  option: TavernReplyOption,
  mapper: TavernCharacterIdMapper,
): TavernReplyOption => ({
  ...option,
  targetCharacterIds: option.targetCharacterIds.map((characterId) =>
    mapCharacterId(characterId, mapper)
  ),
});

const mapTavernStatusEvent = (
  event: TavernStatusEvent,
  mapper: TavernCharacterIdMapper,
): TavernStatusEvent => ({
  ...event,
  target: mapTavernStatusTargetRef(event.target, mapper),
});

const mapTavernProgressAction = (
  action: TavernProgressAction,
  mapper: TavernCharacterIdMapper,
): TavernProgressAction => {
  if (action.type === "statusPatch") {
    return {
      ...action,
      statusEvents: action.statusEvents.map((event) => mapTavernStatusEvent(event, mapper)),
    };
  }
  if (action.type === "replyOptions") {
    return {
      ...action,
      options: action.options.map((option) => mapTavernReplyOption(option, mapper)),
    };
  }
  return action;
};

const mapTavernTaskDefinition = (
  task: TavernTaskDefinition,
  mapper: TavernCharacterIdMapper,
): TavernTaskDefinition => ({
  ...task,
  owner: mapTavernEntityRef(task.owner, mapper),
  participants: task.participants?.map((participant) => mapTavernEntityRef(participant, mapper)),
  lifecycle: {
    ...task.lifecycle,
    startCondition: task.lifecycle.startCondition
      ? mapTavernCondition(task.lifecycle.startCondition, mapper)
      : undefined,
    completeCondition: mapTavernCondition(task.lifecycle.completeCondition, mapper),
    failCondition: task.lifecycle.failCondition
      ? mapTavernCondition(task.lifecycle.failCondition, mapper)
      : undefined,
  },
  onComplete: task.onComplete?.map((action) => mapTavernProgressAction(action, mapper)),
  onFail: task.onFail?.map((action) => mapTavernProgressAction(action, mapper)),
});

const mapTavernTaskDefinitions = (
  value: unknown,
  mapper: TavernCharacterIdMapper,
) => Array.isArray(value)
  ? normalizeTaskDefinitions(value, []).map((item) => mapTavernTaskDefinition(item, mapper))
  : value;

const mapTavernSceneOutcomeDefinition = (
  outcome: TavernSceneOutcomeDefinition,
  mapper: TavernCharacterIdMapper,
): TavernSceneOutcomeDefinition => ({
  ...outcome,
  winner: outcome.winner?.map((entity) => mapTavernEntityRef(entity, mapper)),
  loser: outcome.loser?.map((entity) => mapTavernEntityRef(entity, mapper)),
  condition: mapTavernCondition(outcome.condition, mapper),
  onAchieved: outcome.onAchieved?.map((action) => mapTavernProgressAction(action, mapper)),
});

const mapTavernSceneOutcomeDefinitions = (
  value: unknown,
  mapper: TavernCharacterIdMapper,
) => Array.isArray(value)
  ? normalizeSceneOutcomes(value, []).map((item) => mapTavernSceneOutcomeDefinition(item, mapper))
  : value;

const mapTavernStatusSnapshot = (
  value: unknown,
  mapper: TavernCharacterIdMapper,
) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  const candidate = value as Partial<TavernStatusSnapshot>;
  const characters = Object.fromEntries(
    Object.entries(candidate.characters ?? {}).map(([characterId, statuses]) => [
      mapCharacterId(characterId, mapper),
      statuses,
    ]),
  );
  const relationships = Object.fromEntries(
    Object.entries(candidate.relationships ?? {}).map(([relationshipKey, statuses]) => {
      const parsed = parseTavernRelationshipStatusKey(relationshipKey);
      if (!parsed) {
        return [relationshipKey, statuses];
      }
      return [
        tavernRelationshipStatusKey(
          mapTavernEntityRef(parsed.subject, mapper),
          mapTavernEntityRef(parsed.object, mapper),
        ),
        statuses,
      ];
    }),
  );

  return {
    ...candidate,
    characters,
    relationships,
  };
};

const mergeLorebookEntries = (
  ...groups: TavernLorebookEntry[][]
) => {
  const seen = new Set<string>();
  return groups.flat().filter((entry) => {
    const key = [
      entry.title.trim().toLowerCase(),
      entry.content.trim().toLowerCase(),
      entry.keywords.map((keyword) => keyword.trim().toLowerCase()).sort().join(","),
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const ensureTavernRoomRuntimeScopes = (room: TavernRoom): TavernRoom => {
  const scenes = room.scenes?.length
    ? room.scenes
    : [buildTavernScene({}, room)];
  const graph = room.storyGraph?.nodes?.length
    ? normalizeStoryGraph(room.storyGraph, scenes)
    : createDefaultStoryGraph(scenes);
  const createdAt = typeof room.createdAt === "number" ? room.createdAt : now();
  const storyRuns = room.storyRuns?.length
    ? room.storyRuns.map((run) => {
        const pathNodeIds = run.pathNodeIds.filter((nodeId) =>
          graph.nodes.some((node) => node.id === nodeId)
        );
        const pathEdgeIds = run.pathEdgeIds.filter((edgeId) =>
          graph.edges.some((edge) => edge.id === edgeId)
        );

        return {
          ...run,
          pathNodeIds,
          pathEdgeIds,
          activeNodeId: pathNodeIds.includes(run.activeNodeId)
            ? run.activeNodeId
            : pathNodeIds[0] ?? graph.activeNodeId,
        };
      }).filter((run) => run.pathNodeIds.length > 0)
    : buildStoryRunsFromGraph(graph, createdAt);
  const normalizedRuns = storyRuns.length > 0
    ? storyRuns
    : buildStoryRunsFromGraph(graph, createdAt);
  const activeRun = resolveActiveRun(normalizedRuns, room.activeRunId);
  const activeNodeId = activeRun?.pathNodeIds.includes(graph.activeNodeId)
    ? graph.activeNodeId
    : activeRun?.activeNodeId ?? activeRun?.pathNodeIds[0] ?? graph.activeNodeId;
  const syncedRuns = normalizedRuns.map((run) =>
    activeRun && run.id === activeRun.id
      ? { ...run, activeNodeId, updatedAt: room.updatedAt }
      : run
  );
  const sceneInstances = buildSceneInstancesForRuns({
    roomId: room.id,
    graph: { ...graph, activeNodeId },
    scenes,
    runs: syncedRuns,
    existingInstances: room.sceneInstances,
  });
  const scopedInstanceId = activeRun
    ? createRouteScopedSceneInstanceId(
        room.id,
        resolveRunNodePrefix(activeRun, activeNodeId),
      )
    : "";
  const activeInstance = sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ??
    sceneInstances.find((instance) => instance.id === scopedInstanceId) ??
    sceneInstances[0] ??
    null;

  return {
    ...room,
    storyGraph: { ...graph, activeNodeId },
    storyRuns: syncedRuns,
    activeRunId: activeRun?.id,
    activeSceneInstanceId: activeInstance?.id,
    activeSceneId: activeInstance?.sceneId ?? room.activeSceneId,
    scenes,
    sceneInstances,
  };
};

const createPresetLorebookEntry = (
  entry: NonNullable<TavernSystemPresetRoom["lorebookEntries"]>[number],
  createdAt: number,
): TavernLorebookEntry | null => {
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  const content = typeof entry.content === "string" ? entry.content.trim() : "";
  if (!title || !content) {
    return null;
  }

  return {
    id: createId("lore"),
    title,
    content,
    keywords: normalizeLorebookKeywords(entry.keywords),
    enabled: entry.enabled !== false,
    alwaysOn: Boolean(entry.alwaysOn),
    createdAt,
    updatedAt: createdAt,
  };
};

const createPresetAssetDraft = (
  draft: NonNullable<TavernSystemPresetRoom["assetDrafts"]>[number],
  characterIdByPresetId: Map<string, string>,
  createdAt: number,
): TavernAssetDraft | null => {
  const sceneMemories = (draft.sceneMemories ?? []).flatMap((memory) => {
    const note = typeof memory.note === "string" ? memory.note.trim() : "";
    const visibility = normalizeSceneMemoryDraftVisibility(memory.visibility);
    return note && visibility
      ? [{
          id: createId("scene-memory-draft"),
          note,
          visibility,
          secretId: memory.secretId?.trim() || undefined,
        }]
      : [];
  });
  const characterMemories = (draft.characterMemories ?? []).flatMap((memory) => {
    const characterId = characterIdByPresetId.get(memory.characterId);
    const note = typeof memory.note === "string" ? memory.note.trim() : "";
    const visibility = normalizeCharacterMemoryDraftVisibility(memory.visibility);
    const revealToCharacterIds = memory.revealToCharacterIds
      ?.map((characterId) => characterIdByPresetId.get(characterId) ?? characterId.trim())
      .filter(Boolean) ?? [];
    return characterId && note && visibility && (visibility !== "character" || revealToCharacterIds.length > 0)
      ? [{
          id: createId("memory-draft"),
          characterId,
          note,
          visibility,
          secretId: memory.secretId?.trim() || undefined,
          revealToCharacterIds,
        }]
      : [];
  });
  const lorebookEntries = (draft.lorebookEntries ?? []).flatMap((entry) => {
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    return title && content
      ? [{
          id: createId("lore-draft"),
          title,
          content,
          keywords: normalizeLorebookKeywords(entry.keywords),
          alwaysOn: Boolean(entry.alwaysOn),
        }]
      : [];
  });

  if (
    sceneMemories.length === 0 &&
    characterMemories.length === 0 &&
    lorebookEntries.length === 0
  ) {
    return null;
  }

  return {
    id: createId("draft"),
    sourceMessageIds: (draft.sourceMessageIds ?? []).filter((item): item is string =>
      typeof item === "string"
    ),
    sceneMemories,
    characterMemories,
    lorebookEntries,
    createdAt,
    updatedAt: createdAt,
  };
};

type TavernSceneInput = Partial<Omit<TavernScene, "scenePresetId">> & {
  scenePresetId?: unknown;
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

const buildTavernScene = (
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

export const getActiveTavernSceneInstance = (
  room: TavernRoom | null | undefined,
) => {
  if (!room?.sceneInstances?.length) {
    return null;
  }

  return resolveActiveSceneInstance(room);
};

export const findTavernSceneInstanceIdForNode = (
  room: TavernRoom,
  nodeId: string | undefined | null,
) => {
  const targetNodeId = nodeId?.trim();
  if (!targetNodeId) {
    return "";
  }

  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeRun = runtimeRoom.storyRuns.find((run) =>
    run.id === runtimeRoom.activeRunId && run.pathNodeIds.includes(targetNodeId)
  ) ?? runtimeRoom.storyRuns.find((run) => run.pathNodeIds.includes(targetNodeId)) ?? null;
  const scopedInstanceId = activeRun
    ? createRouteScopedSceneInstanceId(
        runtimeRoom.id,
        resolveRunNodePrefix(activeRun, targetNodeId),
      )
    : "";

  return runtimeRoom.sceneInstances.find((instance) => instance.id === scopedInstanceId)?.id ??
    runtimeRoom.sceneInstances.find((instance) => instance.nodeId === targetNodeId)?.id ??
    "";
};

export const switchTavernRoomStoryNode = (
  room: TavernRoom,
  nodeId: string | undefined | null,
) => {
  const sceneInstanceId = findTavernSceneInstanceIdForNode(room, nodeId);
  return sceneInstanceId ? switchTavernRoomSceneInstance(room, sceneInstanceId) : room;
};

export const projectTavernSceneOntoRoom = (room: TavernRoom): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  return {
    ...runtimeRoom,
    activeSceneId: activeInstance.sceneId,
    activeSceneInstanceId: activeInstance.id,
    scene: activeInstance.scene,
    sceneGoal: activeInstance.sceneGoal,
    scenePlot: activeInstance.plot,
    sceneDirection: activeInstance.storyDirection,
    sceneTransition: activeInstance.transition,
    memory: activeInstance.memory,
    relationshipOverrides: activeInstance.relationshipOverrides,
    sceneStatus: activeInstance.sceneStatus,
    characterPublicStatuses: activeInstance.characterPublicStatuses,
    characterPrivateStatuses: activeInstance.characterPrivateStatuses,
    pendingInteractions: activeInstance.pendingInteractions,
    replyOptions: activeInstance.replyOptions,
    factEvents: activeInstance.factEvents,
    statusEvents: activeInstance.statusEvents,
    statusSnapshot: activeInstance.statusSnapshot,
    previousStatusSnapshot: activeInstance.previousStatusSnapshot,
    statusCheckpoints: activeInstance.statusCheckpoints,
    taskDefinitions: activeInstance.taskDefinitions,
    taskEvents: activeInstance.taskEvents,
    taskSnapshot: activeInstance.taskSnapshot,
    sceneOutcomes: activeInstance.sceneOutcomes,
    outcomeEvents: activeInstance.outcomeEvents,
    characterConfigs: activeInstance.characterConfigs ?? {},
    characterMemories: activeInstance.characterMemories,
    illustrationHints: activeInstance.illustrationHints,
    assetDrafts: activeInstance.assetDrafts,
    characterIds: activeInstance.characterIds,
    activeCharacterId: activeInstance.activeCharacterId,
  };
};

export type TavernBranchUpstreamMemoryLoadResult = {
  room: TavernRoom;
  sourceInstanceIds: string[];
  sceneMemory: string;
  characterMemories: Record<string, string>;
  revealedSecretIds: string[];
};

export const loadTavernBranchUpstreamMemory = (
  room: TavernRoom,
): TavernBranchUpstreamMemoryLoadResult => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return {
      room: runtimeRoom,
      sourceInstanceIds: [],
      sceneMemory: "",
      characterMemories: {},
      revealedSecretIds: [],
    };
  }

  const { upstreamInstances, pathInstances } = getTavernBranchPathInstances(runtimeRoom, activeInstance);
  const reveals = getTavernBranchSecretReveals(pathInstances);
  const revealedSecretIds = Array.from(new Set(reveals.map((reveal) => reveal.secretId)));

  const sceneMemory = formatTavernMemoryBlocks(upstreamInstances.map((instance) => {
    const layers = createEmptySceneMemoryLayers(instance.memoryLayers);
    const entryLines = (layers.entries ?? [])
      .map((entry) => resolveSceneMemoryEntryText(entry, reveals))
      .filter(Boolean);

    return {
      title: getTavernSceneInstanceDisplayTitle(runtimeRoom, instance.id, instance.title),
      lines: [
        layers.required,
        instance.memory,
        layers.public,
        layers.private,
        ...entryLines,
      ],
    };
  }));

  const characterIds = Array.from(new Set([
    ...runtimeRoom.characterIds,
    ...activeInstance.characterIds,
    ...upstreamInstances.flatMap((instance) => [
      ...instance.characterIds,
      ...Object.keys(instance.characterMemoryLayers ?? {}),
    ]),
  ]));
  const characterMemories = Object.fromEntries(characterIds.flatMap((characterId) => {
    const memory = formatTavernMemoryBlocks(upstreamInstances.map((instance) => {
      const layers = createEmptyCharacterMemoryLayers(
        instance.characterMemoryLayers?.[characterId],
      );
      const entryLines = (layers.entries ?? [])
        .map((entry) => resolveCharacterMemoryEntryText(entry, reveals, characterId))
        .filter(Boolean);

      return {
        title: getTavernSceneInstanceDisplayTitle(runtimeRoom, instance.id, instance.title),
        lines: [
          layers.required,
          layers.public,
          layers.known,
          layers.privateSelf,
          ...entryLines,
        ],
      };
    }));

    return memory.trim() ? [[characterId, memory]] : [];
  }));
  const updatedAt = Date.now();
  const nextInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    const nextCharacterMemoryLayers = { ...instance.characterMemoryLayers };
    for (const characterId of characterIds) {
      const layers = createEmptyCharacterMemoryLayers(nextCharacterMemoryLayers[characterId]);
      nextCharacterMemoryLayers[characterId] = {
        ...layers,
        known: characterMemories[characterId] ?? "",
        updatedAt,
      };
    }

    return {
      ...instance,
      memoryLayers: {
        ...createEmptySceneMemoryLayers(instance.memoryLayers),
        upstream: sceneMemory,
        updatedAt,
      },
      characterMemoryLayers: nextCharacterMemoryLayers,
      updatedAt,
    };
  });

  return {
    room: projectTavernSceneOntoRoom({
      ...runtimeRoom,
      sceneInstances: nextInstances,
      updatedAt,
    }),
    sourceInstanceIds: upstreamInstances.map((instance) => instance.id),
    sceneMemory,
    characterMemories,
    revealedSecretIds,
  };
};

export type TavernBranchSecretMemoryOption = {
  secretId: string;
  text: string;
  sourceInstanceId: string;
  sourceTitle: string;
  target: "scene" | "character";
  characterId?: string;
  ownerCharacterId?: string;
};

export const listTavernBranchSecretMemoryEntries = (
  room: TavernRoom,
): TavernBranchSecretMemoryOption[] => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return [];
  }

  const { pathInstances } = getTavernBranchPathInstances(runtimeRoom, activeInstance);
  const seen = new Set<string>();

  return pathInstances.flatMap((instance) => {
    const sourceTitle = getTavernSceneInstanceDisplayTitle(runtimeRoom, instance.id, instance.title);
    const sceneEntries = (instance.memoryLayers.entries ?? []).flatMap((entry) => {
      const secretId = entry.secretId?.trim();
      const text = entry.text.trim();
      if (!secretId || !text || seen.has(`scene:${secretId}`)) {
        return [];
      }
      seen.add(`scene:${secretId}`);
      return [{
        secretId,
        text,
        sourceInstanceId: instance.id,
        sourceTitle,
        target: "scene" as const,
        ownerCharacterId: entry.ownerCharacterId,
      }];
    });
    const characterEntries = Object.entries(instance.characterMemoryLayers ?? {})
      .flatMap(([characterId, layers]) =>
        (layers.entries ?? []).flatMap((entry) => {
          const secretId = entry.secretId?.trim();
          const text = entry.text.trim();
          if (!secretId || !text || seen.has(`character:${characterId}:${secretId}`)) {
            return [];
          }
          seen.add(`character:${characterId}:${secretId}`);
          return [{
            secretId,
            text,
            sourceInstanceId: instance.id,
            sourceTitle,
            target: "character" as const,
            characterId,
            ownerCharacterId: entry.ownerCharacterId,
          }];
        })
      );

    return [...sceneEntries, ...characterEntries];
  });
};

export type TavernSecretMemoryTarget =
  | { type: "scene" }
  | { type: "character"; characterId: string };

export const addTavernSecretMemoryEntry = (
  room: TavernRoom,
  input: {
    target: TavernSecretMemoryTarget;
    text: string;
    secretId?: string;
  },
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  const text = input.text.trim();
  if (!activeInstance || !text) {
    return { room: runtimeRoom, entry: null };
  }

  const createdAt = Date.now();
  const secretId = input.secretId?.trim() || createId("secret");
  const entry: TavernMemoryEntry = {
    id: createId("memory-entry"),
    text,
    visibility: "hidden",
    secretId,
    ownerCharacterId: input.target.type === "character" ? input.target.characterId : undefined,
    visibleToCharacterIds: [],
    sourceMessageIds: [],
    createdAt,
    updatedAt: createdAt,
  };

  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    if (input.target.type === "scene") {
      const memoryLayers = createEmptySceneMemoryLayers(instance.memoryLayers);
      return {
        ...instance,
        memoryLayers: {
          ...memoryLayers,
          entries: [...(memoryLayers.entries ?? []), entry],
          updatedAt: createdAt,
        },
        updatedAt: createdAt,
      };
    }

    const characterMemoryLayers = { ...instance.characterMemoryLayers };
    const layers = createEmptyCharacterMemoryLayers(characterMemoryLayers[input.target.characterId]);
    characterMemoryLayers[input.target.characterId] = {
      ...layers,
      entries: [...(layers.entries ?? []), entry],
      updatedAt: createdAt,
    };

    return {
      ...instance,
      characterMemoryLayers,
      updatedAt: createdAt,
    };
  });

  return {
    room: projectTavernSceneOntoRoom({
      ...runtimeRoom,
      sceneInstances,
      updatedAt: createdAt,
    }),
    entry,
  };
};

export const revealTavernSecretMemory = (
  room: TavernRoom,
  input: {
    secretId: string;
    visibility: "public" | "character";
    targetCharacterIds?: string[];
    note?: string;
  },
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  const secretId = input.secretId.trim();
  if (!activeInstance || !secretId) {
    return { room: runtimeRoom, reveal: null };
  }

  const revealedAt = Date.now();
  const targetCharacterIds = input.visibility === "character"
    ? Array.from(new Set((input.targetCharacterIds ?? []).filter(Boolean)))
    : [];
  const reveal: TavernSecretReveal = {
    id: createId("secret-reveal"),
    secretId,
    scope: { type: "sceneInstance", sceneInstanceId: activeInstance.id },
    visibility: input.visibility,
    targetCharacterIds,
    sourceMessageIds: [],
    note: input.note?.trim() || undefined,
    revealedAt,
  };

  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    const existingReveals = instance.secretReveals.filter((item) =>
      !(
        item.secretId === reveal.secretId &&
        item.scope.type === "sceneInstance" &&
        item.scope.sceneInstanceId === activeInstance.id &&
        item.visibility === reveal.visibility &&
        item.targetCharacterIds.join("|") === reveal.targetCharacterIds.join("|")
      )
    );

    const matchingSceneEntryTexts = (instance.memoryLayers.entries ?? [])
      .filter((entry) => entry.secretId === reveal.secretId)
      .map((entry) => entry.text.trim())
      .filter(Boolean);
    const matchingCharacterEntryTexts = Object.values(instance.characterMemoryLayers ?? {})
      .flatMap((layers) => (layers.entries ?? [])
        .filter((entry) => entry.secretId === reveal.secretId)
        .map((entry) => entry.text.trim())
        .filter(Boolean)
      );
    let nextMemoryLayers = createEmptySceneMemoryLayers(instance.memoryLayers);
    let nextCharacterMemoryLayers = { ...instance.characterMemoryLayers };
    if (reveal.visibility === "public") {
      nextMemoryLayers = {
        ...nextMemoryLayers,
        public: collectUniqueTrimmedLines([
          nextMemoryLayers.public,
          ...matchingSceneEntryTexts,
        ]).join("\n"),
        updatedAt: revealedAt,
      };
      nextCharacterMemoryLayers = Object.fromEntries(
        Object.entries(nextCharacterMemoryLayers).map(([characterId, layers]) => {
          const normalizedLayers = createEmptyCharacterMemoryLayers(layers);
          const entryTexts = (normalizedLayers.entries ?? [])
            .filter((entry) => entry.secretId === reveal.secretId)
            .map((entry) => entry.text.trim())
            .filter(Boolean);
          return [
            characterId,
            {
              ...normalizedLayers,
              public: collectUniqueTrimmedLines([
                normalizedLayers.public,
                ...entryTexts,
              ]).join("\n"),
              updatedAt: entryTexts.length > 0 ? revealedAt : normalizedLayers.updatedAt,
            },
          ];
        }),
      );
    } else {
      for (const characterId of reveal.targetCharacterIds) {
        const normalizedLayers = createEmptyCharacterMemoryLayers(nextCharacterMemoryLayers[characterId]);
        nextCharacterMemoryLayers[characterId] = {
          ...normalizedLayers,
          known: collectUniqueTrimmedLines([
            normalizedLayers.known,
            ...matchingSceneEntryTexts,
            ...matchingCharacterEntryTexts,
          ]).join("\n"),
          updatedAt: revealedAt,
        };
      }
    }

    return {
      ...instance,
      secretReveals: [...existingReveals, reveal],
      memoryLayers: nextMemoryLayers,
      characterMemoryLayers: nextCharacterMemoryLayers,
      updatedAt: revealedAt,
    };
  });

  return {
    room: projectTavernSceneOntoRoom({
      ...runtimeRoom,
      sceneInstances,
      updatedAt: revealedAt,
    }),
    reveal,
  };
};

export const updateTavernActiveSceneMemoryLayers = (
  room: TavernRoom,
  patch: Partial<TavernSceneMemoryLayers>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    return {
      ...instance,
      memoryLayers: {
        ...createEmptySceneMemoryLayers(instance.memoryLayers),
        ...patch,
        updatedAt,
      },
      updatedAt,
    };
  });

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const updateTavernActiveCharacterMemoryLayers = (
  room: TavernRoom,
  characterId: string,
  patch: Partial<TavernCharacterMemoryLayers>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance || !characterId) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) => {
    if (instance.id !== activeInstance.id) {
      return instance;
    }

    const characterMemoryLayers = { ...instance.characterMemoryLayers };
    characterMemoryLayers[characterId] = {
      ...createEmptyCharacterMemoryLayers(characterMemoryLayers[characterId]),
      ...patch,
      updatedAt,
    };

    return {
      ...instance,
      characterMemoryLayers,
      updatedAt,
    };
  });

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const updateTavernActiveScenePromptOverrides = (
  room: TavernRoom,
  overrides: Partial<TavernScenePromptOverrides>,
) => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const updatedAt = Date.now();
  const sceneInstances = runtimeRoom.sceneInstances.map((instance) =>
    instance.id === activeInstance.id
      ? {
          ...instance,
          promptOverrides: normalizeScenePromptOverrides(overrides),
          updatedAt,
        }
      : instance
  );

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    sceneInstances,
    updatedAt,
  });
};

export const syncTavernRoomActiveScene = (room: TavernRoom): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = getActiveTavernSceneInstance(runtimeRoom);
  if (!activeInstance) {
    return runtimeRoom;
  }

  const syncedInstance: TavernSceneInstance = {
    ...activeInstance,
    scenePresetId: room.scenePresetId,
    scene: room.scene,
    sceneGoal: room.sceneGoal,
    plot: room.scenePlot,
    storyDirection: room.sceneDirection,
    transition: room.sceneTransition,
    memory: room.memory,
    relationshipOverrides: room.relationshipOverrides,
    sceneStatus: room.sceneStatus,
    characterPublicStatuses: room.characterPublicStatuses,
    characterPrivateStatuses: room.characterPrivateStatuses,
    pendingInteractions: room.pendingInteractions,
    replyOptions: room.replyOptions,
    factEvents: room.factEvents,
    statusEvents: room.statusEvents,
    statusSnapshot: room.statusSnapshot,
    previousStatusSnapshot: room.previousStatusSnapshot,
    statusCheckpoints: room.statusCheckpoints,
    taskDefinitions: room.taskDefinitions,
    taskEvents: room.taskEvents,
    taskSnapshot: room.taskSnapshot,
    sceneOutcomes: room.sceneOutcomes,
    outcomeEvents: room.outcomeEvents,
    characterConfigs: room.characterConfigs ?? {},
    characterMemories: room.characterMemories,
    illustrationHints: room.illustrationHints,
    assetDrafts: room.assetDrafts,
    characterIds: room.characterIds,
    activeCharacterId: room.activeCharacterId,
    updatedAt: room.updatedAt,
  };

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeSceneId: syncedInstance.sceneId,
    activeSceneInstanceId: syncedInstance.id,
    sceneInstances: runtimeRoom.sceneInstances.map((instance) =>
      instance.id === syncedInstance.id ? syncedInstance : instance
    ),
  });
};

export const switchTavernRoomScene = (
  room: TavernRoom,
  sceneId: string,
): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const scene = runtimeRoom.scenes?.find((item) => item.id === sceneId);
  const node = runtimeRoom.storyGraph?.nodes.find((item) => item.sceneId === sceneId);
  const activeRun = node
    ? runtimeRoom.storyRuns.find((run) =>
        run.id === runtimeRoom.activeRunId && run.pathNodeIds.includes(node.id)
      ) ?? runtimeRoom.storyRuns.find((run) => run.pathNodeIds.includes(node.id)) ?? null
    : null;
  const activeInstanceId = activeRun && node
    ? createRouteScopedSceneInstanceId(
        runtimeRoom.id,
        resolveRunNodePrefix(activeRun, node.id),
      )
    : undefined;
  return scene
    ? projectTavernSceneOntoRoom({
        ...runtimeRoom,
        storyGraph: node
          ? {
              ...runtimeRoom.storyGraph,
              activeNodeId: node.id,
            }
          : runtimeRoom.storyGraph,
        storyRuns: activeRun
          ? runtimeRoom.storyRuns.map((run) =>
              run.id === activeRun.id ? { ...run, activeNodeId: node?.id ?? run.activeNodeId } : run
            )
          : runtimeRoom.storyRuns,
        activeRunId: activeRun?.id ?? runtimeRoom.activeRunId,
        activeSceneId: scene.id,
        activeSceneInstanceId: activeInstanceId ?? runtimeRoom.activeSceneInstanceId,
        updatedAt: Date.now(),
      })
    : runtimeRoom;
};

export const switchTavernRoomSceneInstance = (
  room: TavernRoom,
  sceneInstanceId: string,
): TavernRoom => {
  const runtimeRoom = ensureTavernRoomRuntimeScopes(room);
  const activeInstance = runtimeRoom.sceneInstances.find((instance) =>
    instance.id === sceneInstanceId
  );
  if (!activeInstance) {
    return switchTavernRoomScene(runtimeRoom, sceneInstanceId);
  }

  const activeRunId = activeInstance.runIds.includes(runtimeRoom.activeRunId ?? "")
    ? runtimeRoom.activeRunId
    : activeInstance.runIds[0] ?? runtimeRoom.activeRunId;

  return projectTavernSceneOntoRoom({
    ...runtimeRoom,
    activeRunId,
    activeSceneId: activeInstance.sceneId,
    activeSceneInstanceId: activeInstance.id,
    storyGraph: {
      ...runtimeRoom.storyGraph,
      activeNodeId: activeInstance.nodeId,
    },
    storyRuns: runtimeRoom.storyRuns.map((run) =>
      run.id === activeRunId
        ? { ...run, activeNodeId: activeInstance.nodeId, updatedAt: Date.now() }
        : run
    ),
    updatedAt: Date.now(),
  });
};

export const createTavernRoomFromSystemPreset = (
  workspaceId: string,
  presetId: string,
  options: {
    roomId?: string;
    storyId?: string;
    roomCreatedAt?: number;
    createdAt?: number;
    characterIdByPresetId?: Map<string, string>;
    markAsSystemPreset?: boolean;
  } = {},
) => {
  const preset = getTavernSystemPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown tavern system preset: ${presetId}`);
  }

  const createdAt = options.createdAt ?? now();
  const roomId = options.roomId ?? createId("room");
  const characterIdByPresetId = new Map<string, string>();
  const rawCharacters: TavernCharacter[] = preset.characters.map((character) => {
    const characterId = options.characterIdByPresetId?.get(character.id) ?? createId("character");
    characterIdByPresetId.set(character.id, characterId);

    return createTavernCharacterFromSystemPresetCharacter(character, {
      id: characterId,
      createdAt,
    });
  });
  const mapSystemCharacterId = (characterId: string) => characterIdByPresetId.get(characterId);
  const characters = rawCharacters.map((character) => ({
    ...character,
    relationships: mapTavernCharacterRelationships(character.relationships, mapSystemCharacterId),
  }));
  const mappedCharacterIds = preset.room.characterIds
    .flatMap((characterId) => {
      const mappedId = characterIdByPresetId.get(characterId);
      return mappedId ? [mappedId] : [];
    });
  const characterIds = mappedCharacterIds.length > 0
    ? mappedCharacterIds
    : characters.map((character) => character.id);
  const activeCharacterId = characterIdByPresetId.get(preset.room.activeCharacterId)
    ?? characterIds[0]
    ?? "";
  const characterMemories = Object.fromEntries(
    Object.entries(preset.room.characterMemories ?? {})
      .flatMap(([presetCharacterId, memory]) => {
        const characterId = characterIdByPresetId.get(presetCharacterId);
        return characterId && memory.trim() ? [[characterId, memory.trim()]] : [];
      }),
  );
  const characterConfigs = normalizeRoomCharacterConfigs(undefined, characterMemories);
  const markAsSystemPreset = options.markAsSystemPreset !== false;
  const presetScenes: TavernSystemPresetScene[] = Array.isArray(preset.room.scenes) && preset.room.scenes.length > 0
    ? preset.room.scenes
    : [{
        title: defaultSceneTitle,
        order: 0,
        scenePresetId: preset.room.scenePresetId,
        scene: preset.room.scene,
        sceneGoal: preset.room.sceneGoal,
        plot: preset.room.plot,
        storyDirection: preset.room.storyDirection,
        transition: preset.room.transition,
        memory: preset.room.memory,
        relationshipOverrides: preset.room.relationshipOverrides,
        sceneStatus: preset.room.sceneStatus,
        characterPublicStatuses: preset.room.characterPublicStatuses,
        characterPrivateStatuses: preset.room.characterPrivateStatuses,
        statusSnapshot: preset.room.statusSnapshot,
        taskDefinitions: preset.room.taskDefinitions,
        sceneOutcomes: preset.room.sceneOutcomes,
        characterMemories: preset.room.characterMemories,
        assetDrafts: preset.room.assetDrafts,
        characterIds: preset.room.characterIds,
        activeCharacterId: preset.room.activeCharacterId,
      }];
  const sharedLorebookEntries = mergeLorebookEntries([
    ...(preset.room.lorebookEntries ?? []),
    ...presetScenes.flatMap((presetScene) => presetScene.lorebookEntries ?? []),
  ].map((entry) => createPresetLorebookEntry(entry, createdAt))
    .filter((entry): entry is TavernLorebookEntry => Boolean(entry)));
  const scenes = presetScenes.map((presetScene, index) => {
    const sceneCharacterIds = (presetScene.characterIds?.length
      ? presetScene.characterIds
      : preset.room.characterIds
    ).map((presetCharacterId) => characterIdByPresetId.get(presetCharacterId))
      .filter((characterId): characterId is string => Boolean(characterId));
    const sceneActiveCharacterId = characterIdByPresetId.get(
      presetScene.activeCharacterId || preset.room.activeCharacterId,
    ) ?? sceneCharacterIds[0] ?? "";
    const sceneCharacterMemories = Object.fromEntries(
      Object.entries(presetScene.characterMemories ?? preset.room.characterMemories ?? {})
        .flatMap(([presetCharacterId, memory]) => {
          const characterId = characterIdByPresetId.get(presetCharacterId);
          return characterId && memory.trim() ? [[characterId, memory.trim()]] : [];
        }),
    );
    const sceneCharacterConfigs = normalizeRoomCharacterConfigs(undefined, sceneCharacterMemories);
    const sceneStatus = normalizeSceneStatus(presetScene.sceneStatus, createdAt);
    const characterPublicStatuses = normalizeCharacterPublicStatuses(
      presetScene.characterPublicStatuses,
      sceneCharacterIds,
      characterIdByPresetId,
      createdAt,
    );
    const characterPrivateStatuses = normalizeCharacterPrivateStatuses(
      presetScene.characterPrivateStatuses,
      sceneCharacterIds,
      characterIdByPresetId,
      createdAt,
    );
    const statusSnapshot = normalizeStatusSnapshot(
      mapTavernStatusSnapshot(
        presetScene.statusSnapshot ?? preset.room.statusSnapshot,
        mapSystemCharacterId,
      ),
      createdAt,
    );

    return buildTavernScene({
      title: presetScene.title?.trim() || defaultSceneTitle,
      order: typeof presetScene.order === "number" ? presetScene.order : index,
      scenePresetId: presetScene.scenePresetId ?? preset.room.scenePresetId,
      scene: presetScene.scene?.trim() || preset.room.scene.trim(),
      sceneGoal: presetScene.sceneGoal?.trim() || preset.room.sceneGoal?.trim() || "",
      plot: presetScene.plot?.trim() || preset.room.plot?.trim() || "",
      storyDirection: presetScene.storyDirection?.trim() || preset.room.storyDirection?.trim() || "",
      transition: presetScene.transition?.trim() || preset.room.transition?.trim() || "",
      memory: presetScene.memory?.trim() || preset.room.memory?.trim() || "",
      relationshipOverrides: mapTavernSceneRelationshipOverrides(
        normalizeSceneRelationshipOverrides(
          presetScene.relationshipOverrides ?? preset.room.relationshipOverrides,
          createdAt,
        ),
        mapSystemCharacterId,
      ),
      sceneStatus,
      characterPublicStatuses,
      characterPrivateStatuses,
      pendingInteractions: [],
      replyOptions: [],
      factEvents: [],
      statusEvents: [],
      statusSnapshot,
      previousStatusSnapshot: undefined,
      statusCheckpoints: [],
      taskDefinitions: normalizeTaskDefinitions(
        mapTavernTaskDefinitions(
          presetScene.taskDefinitions ?? preset.room.taskDefinitions,
          mapSystemCharacterId,
        ),
      ),
      taskEvents: [],
      taskSnapshot: {},
      sceneOutcomes: normalizeSceneOutcomes(
        mapTavernSceneOutcomeDefinitions(
          presetScene.sceneOutcomes ?? preset.room.sceneOutcomes,
          mapSystemCharacterId,
        ),
      ),
      outcomeEvents: [],
      characterConfigs: sceneCharacterConfigs,
      characterMemories: sceneCharacterMemories,
      illustrationHints: [],
      assetDrafts: (presetScene.assetDrafts ?? preset.room.assetDrafts ?? [])
        .map((draft) => createPresetAssetDraft(draft, characterIdByPresetId, createdAt))
        .filter((draft): draft is TavernAssetDraft => Boolean(draft)),
      characterIds: sceneCharacterIds,
      activeCharacterId: sceneActiveCharacterId,
      createdAt,
      updatedAt: createdAt,
    });
  }).sort((left, right) => left.order - right.order)
    .map((item, index) => ({ ...item, order: index }));
  const scene = scenes[0] ?? buildTavernScene({
    title: defaultSceneTitle,
    characterConfigs,
    characterMemories,
    characterIds,
    activeCharacterId,
    createdAt,
    updatedAt: createdAt,
  });
  const storyGraph = createDefaultStoryGraph(scenes.length > 0 ? scenes : [scene]);
  const presentation = normalizeRoomPresentation({
    presentation: preset.room.presentation,
    presentationProfileId: preset.room.presentationProfileId,
  });
  const room: TavernRoom = projectTavernSceneOntoRoom({
    id: roomId,
    workspaceId,
    ...(markAsSystemPreset
      ? {
          systemPresetId: preset.id,
          systemPresetVersion: preset.version,
        }
      : {}),
    locked: false,
    title: preset.room.title.trim(),
    presentation,
    prompt: createDefaultTavernPromptSettings({
      presentationProfileId: presentation.profileId,
      promptStyleId: normalizeTavernPromptStyleId(preset.room.promptStyleId),
      systemNarrativePresetId: DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
      ruleCompositionId: DEFAULT_TAVERN_RULE_COMPOSITION_ID,
      immersiveDescriptionEnabled: true,
    }),
    creationSource: markAsSystemPreset ? "imported" : "manual",
    storyBinding: createTavernStoryBinding(options.storyId ?? roomId, createdAt),
    storyOutline: preset.room.storyOutline?.trim() || "",
    storyGoal: preset.room.storyGoal?.trim() || "",
    storyGraph,
    storyRuns: [],
    activeRunId: undefined,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    activeSceneId: scene.id,
    scenes: scenes.length > 0 ? scenes : [scene],
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    pendingInteractions: scene.pendingInteractions,
    replyOptions: scene.replyOptions,
    statusDefinitions: normalizeStatusDefinitions(preset.room.statusDefinitions),
    statusRules: normalizeStatusRules(preset.room.statusRules),
    progressViews: normalizeProgressViews(preset.room.progressViews),
    progressTracker: normalizeProgressTracker(preset.room.progressTracker),
    factEvents: scene.factEvents,
    statusEvents: scene.statusEvents,
    statusSnapshot: scene.statusSnapshot,
    previousStatusSnapshot: scene.previousStatusSnapshot,
    statusCheckpoints: scene.statusCheckpoints,
    taskDefinitions: normalizeTaskDefinitions(
      mapTavernTaskDefinitions(preset.room.taskDefinitions, mapSystemCharacterId),
    ),
    taskEvents: scene.taskEvents,
    taskSnapshot: scene.taskSnapshot,
    sceneOutcomes: scene.sceneOutcomes,
    outcomeEvents: scene.outcomeEvents,
    characterConfigs,
    characterMemories,
    localCharacters: characters,
    lorebookEntries: sharedLorebookEntries,
    illustrationHints: scene.illustrationHints,
    assetDrafts: scene.assetDrafts,
    characterIds,
    activeCharacterId,
    replyMode: normalizeReplyMode(preset.room.replyMode),
    userPersonaName: preset.room.userPersonaName?.trim() || "我",
    settings: normalizeRoomSettings(preset.room.settings, {
      characters,
      characterIds,
      mapCharacterId: mapSystemCharacterId,
      profileSource: "preset",
      updatedAt: createdAt,
    }),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  });
  const messages: TavernMessage[] = preset.messages.flatMap((message): TavernMessage[] => {
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (!content) {
      return [];
    }

    if (message.role === "character") {
      const characterId = characterIdByPresetId.get(message.characterId ?? "");
      return characterId
        ? [{
            id: createId("message"),
            roomId,
            sceneId: room.activeSceneId,
            sceneInstanceId: room.activeSceneInstanceId,
            role: "character" as const,
            characterId,
            content,
            createdAt,
            status: "done" as const,
          }]
        : [];
    }

    return [{
      id: createId("message"),
      roomId,
      sceneId: room.activeSceneId,
      sceneInstanceId: room.activeSceneInstanceId,
      role: message.role === "user" ? "user" as const : "narrator" as const,
      content,
      createdAt,
      status: "done" as const,
    }];
  }).map((message) => materializeTavernMessage(message, room.presentation.profileId));

  return {
    preset,
    room,
    characters,
    messages: messages.length > 0
      ? messages
      : [
          {
            id: createId("message"),
            roomId,
            sceneId: room.activeSceneId,
            sceneInstanceId: room.activeSceneInstanceId,
            role: "narrator" as const,
            content: "系统预设酒馆已恢复默认，灯光重新亮起。",
            createdAt,
            status: "done" as const,
          },
        ],
  };
};

const trimGeneratedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const rememberGeneratedCharacterKey = (
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

const resolveGeneratedCharacterId = (
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

const normalizeGeneratedCharacterIds = (
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

const normalizeGeneratedStringRecord = (
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

const normalizeGeneratedCharacterObjectRecord = (
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

const normalizeGeneratedStatusSnapshot = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  const mapGeneratedCharacterId = (characterId: string) =>
    resolveGeneratedCharacterId(characterId, characterIdByGeneratedKey);
  return mapTavernStatusSnapshot(value, mapGeneratedCharacterId);
};

const normalizeGeneratedEntityRef = (
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

const createGeneratedFactEvent = (
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

const firstJsonObjectFromText = (text: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
};

export const parseTavernGeneratedPresetJsonText = (
  text: string,
): TavernGeneratedPresetJson => {
  const trimmed = text.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : firstJsonObjectFromText(trimmed);
  if (!jsonText) {
    throw new Error("未找到可导入的酒馆 JSON 对象");
  }

  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("酒馆生成结果必须是 JSON 对象");
  }

  return parsed as TavernGeneratedPresetJson;
};

const createGeneratedCharacter = (
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

export const createTavernRoomFromGeneratedPresetJson = (
  workspaceId: string,
  generated: TavernGeneratedPresetJson,
  options: {
    roomId?: string;
    storyId?: string;
    roomCreatedAt?: number;
    createdAt?: number;
    creationSource?: TavernRoom["creationSource"];
  } = {},
) => {
  const createdAt = options.createdAt ?? now();
  const roomId = options.roomId ?? createId("room");
  const roomInput: TavernGeneratedPresetRoom = generated.room ?? {};
  const sourceCharacters = Array.isArray(generated.characters)
    ? generated.characters
    : [];
  const characterIdByGeneratedKey = new Map<string, string>();
  const generatedCharacters = sourceCharacters.flatMap((character, index) => {
    const materialized = createGeneratedCharacter(character, index, createdAt);
    if (!materialized) {
      return [];
    }

    rememberGeneratedCharacterKey(characterIdByGeneratedKey, character.id, materialized.id);
    rememberGeneratedCharacterKey(characterIdByGeneratedKey, character.name, materialized.id);
    rememberGeneratedCharacterKey(characterIdByGeneratedKey, materialized.name, materialized.id);
    rememberGeneratedCharacterKey(characterIdByGeneratedKey, materialized.id, materialized.id);
    return [{
      source: character,
      character: materialized,
    }];
  });
  if (generatedCharacters.length === 0) {
    throw new Error("生成酒馆至少需要一个有效角色");
  }

  const mapGeneratedCharacterId = (characterId: string) =>
    resolveGeneratedCharacterId(characterId, characterIdByGeneratedKey);
  const characters = generatedCharacters.map(({ character }) => ({
    ...character,
    relationships: mapTavernCharacterRelationships(character.relationships, mapGeneratedCharacterId),
  }));
  const allCharacterIds = characters.map((character) => character.id);
  const roomCharacterIds = normalizeGeneratedCharacterIds(
    roomInput.characterIds,
    allCharacterIds,
    characterIdByGeneratedKey,
  );
  const roomActiveCharacterId = resolveGeneratedCharacterId(
    roomInput.activeCharacterId,
    characterIdByGeneratedKey,
  ) ?? roomCharacterIds[0] ?? "";
  const characterMemoryDefaults = Object.fromEntries(
    generatedCharacters.flatMap(({ source, character }) => {
      const memory = trimGeneratedString(source.memory);
      return memory ? [[character.id, memory]] : [];
    }),
  );
  const roomCharacterMemories = {
    ...characterMemoryDefaults,
    ...normalizeGeneratedStringRecord(roomInput.characterMemories, characterIdByGeneratedKey),
  };
  const roomCharacterConfigs = normalizeRoomCharacterConfigs(undefined, roomCharacterMemories);
  const characterPublicStatusDefaults = Object.fromEntries(
    generatedCharacters.flatMap(({ source, character }) =>
      source.publicStatus && typeof source.publicStatus === "object"
        ? [[character.id, source.publicStatus]]
        : []
    ),
  );
  const characterPrivateStatusDefaults = Object.fromEntries(
    generatedCharacters.flatMap(({ source, character }) =>
      source.privateStatus && typeof source.privateStatus === "object"
        ? [[character.id, source.privateStatus]]
        : []
    ),
  );
  const generatedScenes: TavernGeneratedPresetScene[] = Array.isArray(roomInput.scenes) &&
      roomInput.scenes.length > 0
    ? roomInput.scenes
    : [{
        title: defaultSceneTitle,
        scenePresetId: roomInput.scenePresetId,
        scene: roomInput.scene,
        sceneGoal: roomInput.sceneGoal,
        plot: roomInput.plot,
        storyDirection: roomInput.storyDirection,
        transition: roomInput.transition,
        memory: roomInput.memory,
        relationshipOverrides: roomInput.relationshipOverrides,
        sceneStatus: roomInput.sceneStatus,
        characterPublicStatuses: roomInput.characterPublicStatuses,
        characterPrivateStatuses: roomInput.characterPrivateStatuses,
        statusSnapshot: roomInput.statusSnapshot,
        factEvents: roomInput.factEvents,
        taskDefinitions: roomInput.taskDefinitions,
        sceneOutcomes: roomInput.sceneOutcomes,
        characterMemories: roomInput.characterMemories,
        lorebookEntries: roomInput.lorebookEntries,
        characterIds: roomInput.characterIds,
        activeCharacterId: roomInput.activeCharacterId,
      }];
  const sharedLorebookEntries = mergeLorebookEntries([
    ...(roomInput.lorebookEntries ?? []),
    ...generatedScenes.flatMap((scene) => scene.lorebookEntries ?? []),
  ].map((entry) => createPresetLorebookEntry(entry, createdAt))
    .filter((entry): entry is TavernLorebookEntry => Boolean(entry)));
  const scenes = generatedScenes.map((sceneInput, index) => {
    const sceneCharacterIds = normalizeGeneratedCharacterIds(
      sceneInput.characterIds,
      roomCharacterIds,
      characterIdByGeneratedKey,
    );
    const sceneActiveCharacterId = resolveGeneratedCharacterId(
      sceneInput.activeCharacterId,
      characterIdByGeneratedKey,
    ) ?? (sceneCharacterIds.includes(roomActiveCharacterId)
      ? roomActiveCharacterId
      : sceneCharacterIds[0] ?? "");
    const sceneCharacterMemories = {
      ...roomCharacterMemories,
      ...normalizeGeneratedStringRecord(
        sceneInput.characterMemories,
        characterIdByGeneratedKey,
      ),
    };
    const scenePublicStatuses = {
      ...characterPublicStatusDefaults,
      ...normalizeGeneratedCharacterObjectRecord(
        roomInput.characterPublicStatuses,
        characterIdByGeneratedKey,
      ),
      ...normalizeGeneratedCharacterObjectRecord(
        sceneInput.characterPublicStatuses,
        characterIdByGeneratedKey,
      ),
    };
    const scenePrivateStatuses = {
      ...characterPrivateStatusDefaults,
      ...normalizeGeneratedCharacterObjectRecord(
        roomInput.characterPrivateStatuses,
        characterIdByGeneratedKey,
      ),
      ...normalizeGeneratedCharacterObjectRecord(
        sceneInput.characterPrivateStatuses,
        characterIdByGeneratedKey,
      ),
    };
    const sceneFactEvents = [
      ...(roomInput.factEvents ?? []),
      ...(sceneInput.factEvents ?? []),
    ].map((factEvent, factIndex) =>
      createGeneratedFactEvent(
        factEvent,
        index * 100 + factIndex,
        createdAt,
        characterIdByGeneratedKey,
      )
    ).filter((factEvent): factEvent is TavernFactEvent => Boolean(factEvent));

    return buildTavernScene({
      id: trimGeneratedString(sceneInput.id) || undefined,
      title: trimGeneratedString(sceneInput.title) || defaultSceneTitle,
      order: typeof sceneInput.order === "number" ? sceneInput.order : index,
      scenePresetId: sceneInput.scenePresetId ?? roomInput.scenePresetId,
      scene: trimGeneratedString(sceneInput.scene) ||
        trimGeneratedString(roomInput.scene) ||
        "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
      sceneGoal: trimGeneratedString(sceneInput.sceneGoal) ||
        trimGeneratedString(roomInput.sceneGoal),
      plot: trimGeneratedString(sceneInput.plot) || trimGeneratedString(roomInput.plot),
      storyDirection: trimGeneratedString(sceneInput.storyDirection) ||
        trimGeneratedString(roomInput.storyDirection),
      transition: trimGeneratedString(sceneInput.transition) ||
        trimGeneratedString(roomInput.transition),
      memory: trimGeneratedString(sceneInput.memory) || trimGeneratedString(roomInput.memory),
      relationshipOverrides: mapTavernSceneRelationshipOverrides(
        normalizeSceneRelationshipOverrides(
          sceneInput.relationshipOverrides ?? roomInput.relationshipOverrides,
          createdAt,
        ),
        mapGeneratedCharacterId,
      ),
      sceneStatus: normalizeSceneStatus(
        sceneInput.sceneStatus ?? roomInput.sceneStatus,
        createdAt,
      ),
      characterPublicStatuses: normalizeCharacterPublicStatuses(
        scenePublicStatuses,
        sceneCharacterIds,
        undefined,
        createdAt,
      ),
      characterPrivateStatuses: normalizeCharacterPrivateStatuses(
        scenePrivateStatuses,
        sceneCharacterIds,
        undefined,
        createdAt,
      ),
      pendingInteractions: [],
      replyOptions: [],
      factEvents: sceneFactEvents,
      statusEvents: [],
      statusSnapshot: normalizeStatusSnapshot(
        normalizeGeneratedStatusSnapshot(
          sceneInput.statusSnapshot ?? roomInput.statusSnapshot,
          characterIdByGeneratedKey,
        ),
        createdAt,
      ),
      previousStatusSnapshot: undefined,
      statusCheckpoints: [],
      taskDefinitions: normalizeTaskDefinitions(
        mapTavernTaskDefinitions(
          sceneInput.taskDefinitions ?? roomInput.taskDefinitions,
          mapGeneratedCharacterId,
        ),
      ),
      taskEvents: [],
      taskSnapshot: {},
      sceneOutcomes: normalizeSceneOutcomes(
        mapTavernSceneOutcomeDefinitions(
          sceneInput.sceneOutcomes ?? roomInput.sceneOutcomes,
          mapGeneratedCharacterId,
        ),
      ),
      outcomeEvents: [],
      characterConfigs: normalizeRoomCharacterConfigs(undefined, sceneCharacterMemories),
      characterMemories: sceneCharacterMemories,
      illustrationHints: [],
      assetDrafts: [],
      characterIds: sceneCharacterIds,
      activeCharacterId: sceneActiveCharacterId,
      createdAt,
      updatedAt: createdAt,
    });
  }).sort((left, right) => left.order - right.order)
    .map((scene, index) => ({ ...scene, order: index }));
  const scene = scenes[0];
  const storyGraph = normalizeStoryGraph(roomInput.storyGraph, scenes);
  const title = trimGeneratedString(roomInput.title) ||
    trimGeneratedString(generated.label) ||
    "智能生成酒馆";
  const presentation = normalizeRoomPresentation({
    presentation: roomInput.presentation,
    presentationProfileId: roomInput.presentationProfileId,
  });
  const generatedPromptSettings = roomInput.settings && typeof roomInput.settings === "object"
    ? roomInput.settings as Partial<TavernRoomSettings> & {
        systemNarrativePreset?: unknown;
        platformStyleId?: unknown;
        qualityRuleIds?: unknown;
      }
    : {};
  const generatedSystemNarrative = normalizeTavernSystemNarrativePresetSettings(
    generatedPromptSettings.systemNarrativePreset,
  );
  const room: TavernRoom = projectTavernSceneOntoRoom({
    id: roomId,
    workspaceId,
    locked: false,
    title,
    presentation,
    prompt: normalizeTavernPromptSettings(roomInput.prompt, createDefaultTavernPromptSettings({
      presentationProfileId: presentation.profileId,
      promptStyleId: normalizeTavernPromptStyleId(roomInput.promptStyleId),
      systemNarrativePresetId: generatedSystemNarrative.presetId,
      ruleCompositionId: normalizeTavernRuleCompositionId(generatedPromptSettings.platformStyleId),
      qualityRuleIds: normalizeTavernQualityRuleIds(generatedPromptSettings.qualityRuleIds),
      immersiveDescriptionEnabled: true,
    })),
    creationSource: options.creationSource ?? "agent_generated",
    storyBinding: createTavernStoryBinding(options.storyId ?? roomId, createdAt),
    storyOutline: trimGeneratedString(roomInput.storyOutline),
    storyGoal: trimGeneratedString(roomInput.storyGoal),
    storyGraph,
    storyRuns: [],
    activeRunId: undefined,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    activeSceneId: scene.id,
    scenes,
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    pendingInteractions: scene.pendingInteractions,
    replyOptions: scene.replyOptions,
    statusDefinitions: normalizeStatusDefinitions(roomInput.statusDefinitions),
    statusRules: normalizeStatusRules(roomInput.statusRules),
    progressViews: normalizeProgressViews(roomInput.progressViews),
    progressTracker: normalizeProgressTracker(roomInput.progressTracker),
    factEvents: scene.factEvents,
    statusEvents: scene.statusEvents,
    statusSnapshot: scene.statusSnapshot,
    previousStatusSnapshot: scene.previousStatusSnapshot,
    statusCheckpoints: scene.statusCheckpoints,
    taskDefinitions: normalizeTaskDefinitions(
      mapTavernTaskDefinitions(roomInput.taskDefinitions, mapGeneratedCharacterId),
    ),
    taskEvents: scene.taskEvents,
    taskSnapshot: scene.taskSnapshot,
    sceneOutcomes: normalizeSceneOutcomes(
      mapTavernSceneOutcomeDefinitions(roomInput.sceneOutcomes, mapGeneratedCharacterId),
    ),
    outcomeEvents: scene.outcomeEvents,
    characterConfigs: roomCharacterConfigs,
    characterMemories: roomCharacterMemories,
    localCharacters: characters,
    lorebookEntries: sharedLorebookEntries,
    illustrationHints: scene.illustrationHints,
    assetDrafts: [],
    characterIds: roomCharacterIds,
    activeCharacterId: roomActiveCharacterId,
    replyMode: normalizeReplyMode(roomInput.replyMode),
    userPersonaName: trimGeneratedString(roomInput.userPersonaName) || "我",
    settings: normalizeRoomSettings(roomInput.settings, {
      characters,
      characterIds: roomCharacterIds,
      mapCharacterId: mapGeneratedCharacterId,
      profileSource: "generated",
      updatedAt: createdAt,
    }),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  });
  const messages = (Array.isArray(generated.messages) ? generated.messages : [])
    .flatMap((message): TavernMessage[] => {
      const content = trimGeneratedString(message.content);
      if (!content) {
        return [];
      }

      if (message.role === "character") {
        const characterId = resolveGeneratedCharacterId(
          message.characterId,
          characterIdByGeneratedKey,
        );
        return characterId
          ? [{
              id: createId("message"),
              roomId,
              sceneId: room.activeSceneId,
              sceneInstanceId: room.activeSceneInstanceId,
              role: "character" as const,
              characterId,
              content,
              createdAt,
              status: "done" as const,
            }]
          : [];
      }

      return [{
        id: createId("message"),
        roomId,
        sceneId: room.activeSceneId,
        sceneInstanceId: room.activeSceneInstanceId,
        role: message.role === "user" ? "user" as const : "narrator" as const,
        content,
        createdAt,
        status: "done" as const,
      }];
    })
    .map((message) => materializeTavernMessage(message, room.presentation.profileId));

  return {
    room,
    characters,
    messages: messages.length > 0
      ? messages
      : [{
          id: createId("message"),
          roomId,
          sceneId: room.activeSceneId,
          sceneInstanceId: room.activeSceneInstanceId,
          role: "narrator" as const,
          presentationProfileId: room.presentation.profileId,
          content: "智能生成酒馆已创建，新的场景已经准备好。",
          createdAt,
          status: "done" as const,
        }].map((message) => materializeTavernMessage(message, room.presentation.profileId)),
  };
};

export const createDefaultTavernState = (workspaceId: string): TavernState => {
  const createdAt = now();
  const materializedPresets = tavernSystemPresets.map((preset) =>
    createTavernRoomFromSystemPreset(workspaceId, preset.id, { createdAt })
  );
  const firstRoom = materializedPresets[0]?.room;

  return {
    version: 3,
    activeRoomId: firstRoom?.id ?? "",
    rooms: materializedPresets.map((preset) => preset.room),
    messagesByInstance: Object.fromEntries(
      materializedPresets.map((preset) => [
        preset.room.activeSceneInstanceId ?? preset.room.activeSceneId ?? preset.room.id,
        preset.messages,
      ]),
    ),
  };
};

const ensureSystemPresetRooms = (
  workspaceId: string,
  state: TavernState,
): TavernState => {
  let nextRooms = [...state.rooms];
  let nextMessagesByInstance = { ...state.messagesByInstance };
  const existingPresetIds = new Set(
    nextRooms.flatMap((room) => room.systemPresetId ? [room.systemPresetId] : []),
  );
  const createdAt = now();

  for (const preset of tavernSystemPresets) {
    if (existingPresetIds.has(preset.id)) {
      continue;
    }

    const materialized = createTavernRoomFromSystemPreset(workspaceId, preset.id, {
      createdAt,
    });

    nextRooms = [...nextRooms, materialized.room];
    nextMessagesByInstance = {
      ...nextMessagesByInstance,
      [materialized.room.activeSceneInstanceId ?? materialized.room.activeSceneId ?? materialized.room.id]:
        materialized.messages,
    };
    existingPresetIds.add(preset.id);
  }

  return {
    ...state,
    activeRoomId: nextRooms.some((room) => room.id === state.activeRoomId)
      ? state.activeRoomId
      : nextRooms[0]?.id ?? "",
    rooms: nextRooms,
    messagesByInstance: nextMessagesByInstance,
  };
};

const normalizeTavernState = (
  workspaceId: string,
  value: unknown,
): TavernState | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernState>;
  if (
    candidate.version !== 3 ||
    !Array.isArray(candidate.rooms) ||
    !candidate.messagesByInstance ||
    typeof candidate.messagesByInstance !== "object"
  ) {
    return null;
  }

  const sourceMessagesByInstance = candidate.messagesByInstance as Record<string, unknown>;
  const rooms = candidate.rooms.filter((room): room is TavernRoom =>
    Boolean(
      room?.id &&
      room.workspaceId === workspaceId &&
      room.title &&
      room.storyGraph &&
      Array.isArray(room.storyGraph.stages) &&
      Array.isArray(room.storyGraph.nodes) &&
      Array.isArray(room.storyGraph.edges) &&
      Array.isArray(room.scenes) &&
      Array.isArray(room.sceneInstances),
    )
  ).map((room) => {
    const systemPresetId = normalizeSystemPresetId((room as Partial<TavernRoom>).systemPresetId);
    const systemPreset = getTavernSystemPreset(systemPresetId);
    const characterMemories = normalizeStringRecord((room as Partial<TavernRoom>).characterMemories);
    const characterConfigs = normalizeRoomCharacterConfigs(
      (room as Partial<TavernRoom>).characterConfigs,
      characterMemories,
    );
    const localCharacters = Array.isArray((room as Partial<TavernRoom>).localCharacters)
      ? ((room as Partial<TavernRoom>).localCharacters ?? [])
          .filter((character): character is TavernCharacter =>
            Boolean(character?.id && character.name)
          )
          .map((character) => normalizeTavernCharacter(character))
      : [];

    const normalizedRoom: TavernRoom = {
      ...room,
      systemPresetId: systemPreset?.id,
      systemPresetVersion: systemPreset
        ? typeof (room as Partial<TavernRoom>).systemPresetVersion === "number"
          ? (room as Partial<TavernRoom>).systemPresetVersion
          : systemPreset.version
        : undefined,
      locked: Boolean((room as Partial<TavernRoom>).locked),
      presentation: normalizeRoomPresentation({
        presentation: (room as Partial<TavernRoom>).presentation,
      }),
      prompt: normalizeTavernPromptSettings(
        (room as Partial<TavernRoom>).prompt,
        createDefaultPromptForPresentation(normalizeRoomPresentation({
          presentation: (room as Partial<TavernRoom>).presentation,
        })),
      ),
      creationSource:
        (room as Partial<TavernRoom>).creationSource === "quick" ||
        (room as Partial<TavernRoom>).creationSource === "imported" ||
        (room as Partial<TavernRoom>).creationSource === "agent_generated"
          ? (room as Partial<TavernRoom>).creationSource
          : "manual",
      storyBinding: normalizeTavernStoryBinding(
        (room as Partial<TavernRoom>).storyBinding,
        room.id,
        typeof (room as Partial<TavernRoom>).createdAt === "number"
          ? (room as Partial<TavernRoom>).createdAt
          : Date.now(),
      ),
      storyOutline: typeof (room as Partial<TavernRoom>).storyOutline === "string"
        ? (room as Partial<TavernRoom>).storyOutline ?? ""
        : "",
      storyGoal: typeof (room as Partial<TavernRoom>).storyGoal === "string"
        ? (room as Partial<TavernRoom>).storyGoal ?? ""
        : "",
      storyGraph: createDefaultStoryGraph([]),
      storyRuns: Array.isArray((room as Partial<TavernRoom>).storyRuns)
        ? (room as Partial<TavernRoom>).storyRuns ?? []
        : [],
      activeRunId: typeof (room as Partial<TavernRoom>).activeRunId === "string"
        ? (room as Partial<TavernRoom>).activeRunId
        : undefined,
      activeSceneInstanceId: typeof (room as Partial<TavernRoom>).activeSceneInstanceId === "string"
        ? (room as Partial<TavernRoom>).activeSceneInstanceId
        : undefined,
      sceneInstances: Array.isArray((room as Partial<TavernRoom>).sceneInstances)
        ? (room as Partial<TavernRoom>).sceneInstances ?? []
        : [],
      scenePresetId: normalizeRoomScenePresetId(room),
      memory: typeof (room as Partial<TavernRoom>).memory === "string"
        ? (room as Partial<TavernRoom>).memory ?? ""
        : "",
      sceneGoal: typeof (room as Partial<TavernRoom>).sceneGoal === "string"
        ? (room as Partial<TavernRoom>).sceneGoal ?? ""
        : "",
      scenePlot: typeof (room as Partial<TavernRoom>).scenePlot === "string"
        ? (room as Partial<TavernRoom>).scenePlot ?? ""
        : "",
      sceneDirection: typeof (room as Partial<TavernRoom>).sceneDirection === "string"
        ? (room as Partial<TavernRoom>).sceneDirection ?? ""
        : "",
      sceneTransition: typeof (room as Partial<TavernRoom>).sceneTransition === "string"
        ? (room as Partial<TavernRoom>).sceneTransition ?? ""
        : "",
      relationshipOverrides: normalizeSceneRelationshipOverrides(
        (room as Partial<TavernRoom>).relationshipOverrides,
        Date.now(),
      ),
      characterConfigs,
      characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
      localCharacters,
      lorebookEntries: Array.isArray((room as Partial<TavernRoom>).lorebookEntries)
        ? ((room as Partial<TavernRoom>).lorebookEntries ?? [])
            .map(normalizeLorebookEntry)
            .filter((entry): entry is TavernLorebookEntry => Boolean(entry))
        : [],
      assetDrafts: Array.isArray((room as Partial<TavernRoom>).assetDrafts)
        ? ((room as Partial<TavernRoom>).assetDrafts ?? [])
            .map(normalizeAssetDraft)
            .filter((draft): draft is TavernAssetDraft => Boolean(draft))
        : [],
      sceneStatus: normalizeSceneStatus((room as Partial<TavernRoom>).sceneStatus, Date.now()),
      characterPublicStatuses: normalizeCharacterPublicStatuses(
        (room as Partial<TavernRoom>).characterPublicStatuses,
        Array.isArray(room.characterIds) ? room.characterIds : [],
        undefined,
        Date.now(),
      ),
      characterPrivateStatuses: normalizeCharacterPrivateStatuses(
        (room as Partial<TavernRoom>).characterPrivateStatuses,
        Array.isArray(room.characterIds) ? room.characterIds : [],
        undefined,
        Date.now(),
      ),
      pendingInteractions: Array.isArray((room as Partial<TavernRoom>).pendingInteractions)
        ? ((room as Partial<TavernRoom>).pendingInteractions ?? [])
            .map(normalizePendingInteraction)
            .filter((interaction): interaction is TavernPendingInteraction => Boolean(interaction))
        : [],
      replyOptions: Array.isArray((room as Partial<TavernRoom>).replyOptions)
        ? ((room as Partial<TavernRoom>).replyOptions ?? [])
            .map(normalizeReplyOption)
            .filter((option): option is TavernReplyOption => Boolean(option))
        : [],
      statusDefinitions: normalizeStatusDefinitions((room as Partial<TavernRoom>).statusDefinitions),
      statusRules: normalizeStatusRules((room as Partial<TavernRoom>).statusRules),
      progressViews: normalizeProgressViews((room as Partial<TavernRoom>).progressViews),
      progressTracker: normalizeProgressTracker((room as Partial<TavernRoom>).progressTracker),
      factEvents: normalizeFactEvents((room as Partial<TavernRoom>).factEvents),
      statusEvents: normalizeStatusEvents((room as Partial<TavernRoom>).statusEvents),
      statusSnapshot: normalizeStatusSnapshot((room as Partial<TavernRoom>).statusSnapshot, Date.now()),
      previousStatusSnapshot: (room as Partial<TavernRoom>).previousStatusSnapshot
        ? normalizeStatusSnapshot((room as Partial<TavernRoom>).previousStatusSnapshot, Date.now())
        : undefined,
      statusCheckpoints: normalizeProgressCheckpoints((room as Partial<TavernRoom>).statusCheckpoints),
      taskDefinitions: normalizeTaskDefinitions((room as Partial<TavernRoom>).taskDefinitions),
      taskEvents: normalizeTaskEvents((room as Partial<TavernRoom>).taskEvents),
      taskSnapshot: normalizeTaskSnapshot((room as Partial<TavernRoom>).taskSnapshot),
      sceneOutcomes: normalizeSceneOutcomes((room as Partial<TavernRoom>).sceneOutcomes),
      outcomeEvents: normalizeOutcomeEvents((room as Partial<TavernRoom>).outcomeEvents),
      illustrationHints: normalizeIllustrationHints((room as Partial<TavernRoom>).illustrationHints),
      replyMode: normalizeReplyMode((room as Partial<TavernRoom>).replyMode),
      userPersonaName: room.userPersonaName || "我",
      settings: normalizeRoomSettings((room as Partial<TavernRoom>).settings),
      characterIds: Array.isArray(room.characterIds) ? room.characterIds : [],
      activeCharacterId: room.activeCharacterId || "",
    };
    const normalizedScenes = Array.isArray((room as Partial<TavernRoom>).scenes)
      ? ((room as Partial<TavernRoom>).scenes ?? [])
          .map((scene) => buildTavernScene(scene, normalizedRoom))
      : [];
    const fallbackScene = buildTavernScene({
      title: defaultSceneTitle,
    }, normalizedRoom);
    const scenes = (normalizedScenes.length > 0 ? normalizedScenes : [fallbackScene])
      .sort((left, right) => left.order - right.order)
      .map((scene, index) => ({ ...scene, order: index }));
    const activeSceneId = scenes.some((scene) => scene.id === (room as Partial<TavernRoom>).activeSceneId)
      ? (room as Partial<TavernRoom>).activeSceneId
      : scenes[0]?.id;

    return projectTavernSceneOntoRoom({
      ...normalizedRoom,
      storyGraph: normalizeStoryGraph((room as Partial<TavernRoom>).storyGraph, scenes),
      activeSceneId,
      scenes,
    });
  });
  if (rooms.length === 0) {
    return null;
  }
  const normalizedRooms = rooms;
  const messagesByInstance = Object.fromEntries(
    normalizedRooms.flatMap((room) => room.sceneInstances.map((instance) => {
      const instanceMessages = Array.isArray(sourceMessagesByInstance[instance.id])
        ? sourceMessagesByInstance[instance.id] as TavernMessage[]
        : [];

      return [
        instance.id,
        instanceMessages
          .filter((message): message is TavernMessage =>
            Boolean(message?.id && message.roomId && message.role && typeof message.content === "string")
          )
          .map((message) => materializeTavernMessage({
            ...message,
            sceneId: message.sceneId ?? instance.sceneId,
            sceneInstanceId: message.sceneInstanceId ?? instance.id,
          }, room.presentation.profileId)),
      ] as const;
    })),
  );

  const activeRoomId = normalizedRooms.some((room) => room.id === candidate.activeRoomId)
    ? candidate.activeRoomId ?? rooms[0].id
    : normalizedRooms[0].id;

  return ensureSystemPresetRooms(workspaceId, {
    version: 3,
    activeRoomId,
    rooms: normalizedRooms,
    messagesByInstance,
  });
};

const loadTavernStateFromLocalStorage = (workspaceId: string): TavernState => {
  if (typeof window === "undefined") {
    return createDefaultTavernState(workspaceId);
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForWorkspace(workspaceId));
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeTavernState(workspaceId, parsed) ?? createDefaultTavernState(workspaceId);
  } catch {
    return createDefaultTavernState(workspaceId);
  }
};

const saveTavernStateToLocalStorage = (workspaceId: string, state: TavernState) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;
  window.localStorage.setItem(storageKeyForWorkspace(workspaceId), JSON.stringify(normalizedState));
};

const deleteTavernStateFromLocalStorage = (workspaceId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKeyForWorkspace(workspaceId));
};

export const loadTavernState = async (
  workspacePath: string,
  workspaceId: string,
): Promise<TavernState> => {
  if (!isTauri()) {
    return loadTavernStateFromLocalStorage(workspaceId);
  }

  deleteTavernStateFromLocalStorage(workspaceId);
  const storedState = await invoke<unknown | null>("load_tavern_state", {
    input: { workspacePath },
  });

  return normalizeTavernState(workspaceId, storedState) ?? createDefaultTavernState(workspaceId);
};

export const saveTavernState = async (
  workspacePath: string,
  workspaceId: string,
  state: TavernState,
) => {
  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;

  if (!isTauri()) {
    saveTavernStateToLocalStorage(workspaceId, normalizedState);
    return normalizedState;
  }

  deleteTavernStateFromLocalStorage(workspaceId);
  await invoke("save_tavern_state", {
    input: { workspacePath, state: normalizedState },
  });
  return normalizedState;
};

export const createTavernRoom = (workspaceId: string, index: number): TavernRoom => {
  const createdAt = now();
  const roomId = createId("room");
  const scene = buildTavernScene({
    title: defaultSceneTitle,
    scenePresetId: DEFAULT_VISUAL_PRESET_ID,
    scene: "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    createdAt,
    updatedAt: createdAt,
  });
  const storyGraph = createDefaultStoryGraph([scene]);
  const presentation = createDefaultTavernPresentation();

  return projectTavernSceneOntoRoom({
    id: roomId,
    workspaceId,
    locked: false,
    title: `新酒馆 ${index}`,
    presentation,
    prompt: createDefaultPromptForPresentation(presentation),
    creationSource: "manual",
    storyBinding: createTavernStoryBinding(roomId, createdAt),
    storyOutline: "",
    storyGoal: "",
    storyGraph,
    storyRuns: [],
    activeRunId: undefined,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    activeSceneId: scene.id,
    scenes: [scene],
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    pendingInteractions: scene.pendingInteractions,
    replyOptions: scene.replyOptions,
    statusDefinitions: [...DEFAULT_TAVERN_STATUS_DEFINITIONS],
    statusRules: [...DEFAULT_TAVERN_STATUS_RULES],
    progressViews: [...DEFAULT_TAVERN_PROGRESS_VIEWS],
    progressTracker: { ...DEFAULT_TAVERN_PROGRESS_TRACKER },
    factEvents: scene.factEvents,
    statusEvents: scene.statusEvents,
    statusSnapshot: scene.statusSnapshot,
    previousStatusSnapshot: scene.previousStatusSnapshot,
    statusCheckpoints: scene.statusCheckpoints,
    taskDefinitions: scene.taskDefinitions,
    taskEvents: scene.taskEvents,
    taskSnapshot: scene.taskSnapshot,
    sceneOutcomes: scene.sceneOutcomes,
    outcomeEvents: scene.outcomeEvents,
    characterConfigs: {},
    characterMemories: {},
    localCharacters: [],
    lorebookEntries: [],
    illustrationHints: scene.illustrationHints,
    assetDrafts: [],
    characterIds: [],
    activeCharacterId: "",
    replyMode: "active",
    userPersonaName: "我",
    settings: cloneDefaultRoomSettings(),
    createdAt,
    updatedAt: createdAt,
  });
};

export const createTavernCharacter = (input: {
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
}): TavernCharacter => {
  const createdAt = now();
  return {
    id: createId("character"),
    name: input.name,
    avatar: input.avatar,
    description: input.description,
    speakingStyle: input.speakingStyle,
    writingStyle: input.writingStyle?.trim() || undefined,
    replyStylePrompt: input.replyStylePrompt?.trim() || undefined,
    goals: input.goals?.trim() || undefined,
    relationships: normalizeCharacterRelationships(input.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};
