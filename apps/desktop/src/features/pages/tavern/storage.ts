import { invoke, isTauri } from "@tauri-apps/api/core";
import { normalizeTavernAvatarId } from "@/assets/agent-avatars";
import {
  DEFAULT_VISUAL_PRESET_ID,
  normalizeVisualPresetId,
} from "@/features/pages/tavern/visual-presets";
import systemPresetData from "./system-presets/default-taverns.json";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCharacterRelationship,
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernCharacterMemoryDraft,
  TavernCondition,
  TavernDirectorProfile,
  TavernEntityRef,
  TavernIllustrationHint,
  TavernLorebookEntry,
  TavernLorebookDraft,
  TavernMessage,
  TavernMemoryEntry,
  TavernFactEvent,
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernGeneratedPresetScene,
  TavernOutcomeEvent,
  TavernPendingInteraction,
  TavernPromptBlock,
  TavernCharacterMemoryLayers,
  TavernPresentationSettings,
  TavernProgressCheckpoint,
  TavernProgressTrackerSettings,
  TavernProgressAction,
  TavernProgressView,
  TavernReplyMode,
  TavernReplyOption,
  TavernRelationshipTarget,
  TavernRoom,
  TavernRoomCharacterConfig,
  TavernSceneRelationshipOverride,
  TavernSceneOutcomeDefinition,
  TavernSceneStatus,
  TavernScene,
  TavernSceneInstance,
  TavernSceneMemoryDraft,
  TavernSceneMemoryLayers,
  TavernScenePromptOverrides,
  TavernSecretReveal,
  TavernStoryEdge,
  TavernStoryGraph,
  TavernStoryBinding,
  TavernStoryNode,
  TavernStoryRun,
  TavernStoryStage,
  TavernRoomSettings,
  TavernState,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusRule,
  TavernStatusSnapshot,
  TavernStatusTargetRef,
  TavernTaskDefinition,
  TavernTaskEvent,
  TavernTaskState,
} from "./types";
import {
  createTavernDirectorProfileFromCharacters,
  normalizeTavernDirectorProfile,
} from "./core/scheduling-profile";
import {
  buildTavernMessageSegments,
  inferTavernMessageKind,
} from "./message";
import {
  DEFAULT_TAVERN_PROMPT_STYLE_ID,
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
  normalizeTavernPresentation,
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
  buildStoryRunsFromGraph,
  createRouteScopedSceneInstanceId,
  resolveActiveRun,
  resolveRunNodePrefix,
} from "./story-runtime";
import {
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_ROOM_SETTINGS,
  DEFAULT_TAVERN_SCENE_OUTCOMES,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
  DEFAULT_TAVERN_TASK_DEFINITIONS,
} from "./defaults";
import {
  getTavernSceneInstanceDisplayTitle,
} from "./scene-selectors";

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

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const createTavernStoryBinding = (
  storyId: string,
  boundAt = now(),
): TavernStoryBinding => ({
  version: 1,
  storyId,
  source: "story",
  boundAt,
});

const createEmptySceneMemoryLayers = (
  input: Partial<TavernSceneMemoryLayers> = {},
): TavernSceneMemoryLayers => ({
  required: input.required?.trim() ?? "",
  upstream: input.upstream?.trim() ?? "",
  private: input.private?.trim() ?? "",
  public: input.public?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  entries: Array.isArray(input.entries) ? input.entries : [],
  updatedAt: input.updatedAt,
});

const createEmptyCharacterMemoryLayers = (
  input: Partial<TavernCharacterMemoryLayers> = {},
): TavernCharacterMemoryLayers => ({
  required: input.required?.trim() ?? "",
  public: input.public?.trim() ?? "",
  known: input.known?.trim() ?? "",
  privateSelf: input.privateSelf?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  entries: Array.isArray(input.entries) ? input.entries : [],
  updatedAt: input.updatedAt,
});

const normalizePromptBlockTarget = (value: unknown): TavernPromptBlock["target"] | null => {
  if (value === "bridge" || value === "director" || value === "character") {
    return value;
  }
  return null;
};

const normalizeScenePromptOverrides = (
  input: Partial<TavernScenePromptOverrides> = {},
): TavernScenePromptOverrides => ({
  version: 1,
  blocks: Array.isArray(input.blocks)
    ? input.blocks.flatMap((block, index) => {
        if (!block || typeof block !== "object") {
          return [];
        }

        const candidate = block as Partial<TavernPromptBlock>;
        const target = normalizePromptBlockTarget(candidate.target);
        const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
        if (!target || !text) {
          return [];
        }

        const label = typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : "节点风格补充";
        const id = typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : `node-prompt:${target}:${index + 1}`;
        const order = typeof candidate.order === "number" && Number.isFinite(candidate.order)
          ? candidate.order
          : 9000 + index;

        return [{
          id,
          target,
          label,
          text,
          enabled: candidate.enabled !== false,
          order,
          source: {
            type: "custom",
            id: "node-prompt-override",
            label: "节点风格补充",
          },
        } satisfies TavernPromptBlock];
      })
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
    : [],
});

const collectUniqueTrimmedLines = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) {
      return [];
    }

    seen.add(trimmed);
    return [trimmed];
  });
};

const formatTavernMemoryBlocks = (
  blocks: Array<{ title: string; lines: string[] }>,
) => blocks
  .flatMap((block) => {
    const lines = collectUniqueTrimmedLines(block.lines);
    return lines.length > 0 ? [`【${block.title}】\n${lines.join("\n")}`] : [];
  })
  .join("\n\n");

const tavernSecretRevealAppliesToInstance = (
  reveal: TavernSecretReveal,
  instance: TavernSceneInstance,
) => {
  switch (reveal.scope.type) {
    case "scene":
      return reveal.scope.sceneId === instance.sceneId;
    case "node":
      return reveal.scope.nodeId === instance.nodeId;
    case "sceneInstance":
      return reveal.scope.sceneInstanceId === instance.id;
    case "run":
      return instance.runIds.includes(reveal.scope.runId);
  }
};

const getTavernBranchSecretReveals = (
  pathInstances: TavernSceneInstance[],
) => pathInstances.flatMap((instance) =>
  instance.secretReveals.filter((reveal) =>
    pathInstances.some((pathInstance) => tavernSecretRevealAppliesToInstance(reveal, pathInstance))
  )
);

const findTavernSecretReveal = (
  secretId: string | undefined,
  reveals: TavernSecretReveal[],
  characterId?: string,
) => {
  if (!secretId) {
    return null;
  }

  return reveals.find((reveal) =>
    reveal.secretId === secretId &&
    (
      reveal.visibility === "public" ||
      (characterId ? reveal.targetCharacterIds.includes(characterId) : false)
    )
  ) ?? null;
};

const resolveSceneMemoryEntryText = (
  entry: TavernMemoryEntry,
  reveals: TavernSecretReveal[],
) => {
  const text = entry.text.trim();
  if (!text) {
    return "";
  }

  if (entry.visibility === "public" || entry.visibility === "character_known") {
    return text;
  }

  const reveal = findTavernSecretReveal(entry.secretId, reveals);
  return reveal?.visibility === "public" ? text : "";
};

const resolveCharacterMemoryEntryText = (
  entry: TavernMemoryEntry,
  reveals: TavernSecretReveal[],
  characterId: string,
) => {
  const text = entry.text.trim();
  if (!text) {
    return "";
  }

  if (
    entry.visibility === "public" ||
    entry.visibleToCharacterIds?.includes(characterId) ||
    (entry.visibility === "private_self" && entry.ownerCharacterId === characterId)
  ) {
    return text;
  }

  return findTavernSecretReveal(entry.secretId, reveals, characterId) ? text : "";
};

const getTavernBranchPathInstances = (
  room: TavernRoom,
  activeInstance: TavernSceneInstance,
) => {
  const upstreamPathNodePrefixes = activeInstance.pathNodeIds
    .slice(0, -1)
    .map((_, index) => activeInstance.pathNodeIds.slice(0, index + 1));
  const upstreamInstances = upstreamPathNodePrefixes.flatMap((pathNodeIds) => {
    const instanceId = createRouteScopedSceneInstanceId(room.id, pathNodeIds);
    const instance = room.sceneInstances.find((item) => item.id === instanceId) ??
      room.sceneInstances.find((item) =>
        item.pathNodeIds.length === pathNodeIds.length &&
        item.pathNodeIds.every((nodeId, index) => nodeId === pathNodeIds[index])
      );
    return instance ? [instance] : [];
  });

  return { upstreamInstances, pathInstances: [...upstreamInstances, activeInstance] };
};

const createDefaultPromptForPresentation = (
  presentation: TavernPresentationSettings,
) => createDefaultTavernPromptSettings({
  presentationProfileId: presentation.profileId,
  promptStyleId: DEFAULT_TAVERN_PROMPT_STYLE_ID,
  systemNarrativePresetId: DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  ruleCompositionId: DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  immersiveDescriptionEnabled: DEFAULT_TAVERN_ROOM_SETTINGS.immersiveDescriptionEnabled,
});

type TavernSystemPresetCharacter = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
};

type TavernSystemPresetMessage = {
  role: TavernMessage["role"];
  characterId?: string;
  content: string;
};

type TavernSystemPresetScene = {
  title?: string;
  order?: number;
  scenePresetId?: unknown;
  scene?: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
    sceneMemories?: Array<{
      note: string;
      visibility?: unknown;
      secretId?: string;
    }>;
    characterMemories?: Array<{
      characterId: string;
      note: string;
      visibility?: unknown;
      secretId?: string;
      revealToCharacterIds?: string[];
    }>;
    lorebookEntries?: Array<{
      title: string;
      content: string;
      keywords?: string[];
      alwaysOn?: boolean;
    }>;
  }>;
  characterIds?: string[];
  activeCharacterId?: string;
};

type TavernSystemPresetRoom = {
  title: string;
  presentation?: Partial<TavernPresentationSettings> & {
    profileId?: unknown;
  };
  presentationProfileId?: unknown;
  promptStyleId?: unknown;
  storyOutline?: string;
  storyGoal?: string;
  scenePresetId?: unknown;
  scene: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusDefinitions?: TavernStatusDefinition[];
  statusRules?: TavernStatusRule[];
  progressViews?: TavernProgressView[];
  progressTracker?: Partial<TavernProgressTrackerSettings>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  scenes?: TavernSystemPresetScene[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
    sceneMemories?: Array<{
      note: string;
      visibility?: unknown;
      secretId?: string;
    }>;
    characterMemories?: Array<{
      characterId: string;
      note: string;
      visibility?: unknown;
      secretId?: string;
      revealToCharacterIds?: string[];
    }>;
    lorebookEntries?: Array<{
      title: string;
      content: string;
      keywords?: string[];
      alwaysOn?: boolean;
    }>;
  }>;
  characterIds: string[];
  activeCharacterId: string;
  replyMode?: TavernReplyMode;
  userPersonaName?: string;
  settings?: Partial<TavernRoomSettings>;
};

export type TavernSystemPreset = {
  id: string;
  version: number;
  label: string;
  description: string;
  characters: TavernSystemPresetCharacter[];
  room: TavernSystemPresetRoom;
  messages: TavernSystemPresetMessage[];
};

type TavernSystemPresetCollection = {
  version: 2;
  presets: TavernSystemPreset[];
};

const tavernSystemPresetCollection = systemPresetData as unknown as TavernSystemPresetCollection;

export const tavernSystemPresets = tavernSystemPresetCollection.presets;

const tavernSystemPresetById = new Map(
  tavernSystemPresets.map((preset) => [preset.id, preset]),
);

export const getTavernSystemPreset = (presetId: string | null | undefined) =>
  tavernSystemPresetById.get(presetId ?? "") ?? null;

const normalizeSystemPresetId = (presetId: unknown) => {
  if (typeof presetId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.id;
};

const normalizeTavernStoryBinding = (
  value: unknown,
  fallbackStoryId: string,
  boundAt = now(),
): TavernStoryBinding => {
  const candidate = value && typeof value === "object"
    ? value as Partial<TavernStoryBinding>
    : {};
  const storyId = typeof candidate.storyId === "string" && candidate.storyId.trim()
    ? candidate.storyId.trim()
    : fallbackStoryId;

  return createTavernStoryBinding(
    storyId,
    typeof candidate.boundAt === "number" ? candidate.boundAt : boundAt,
  );
};

const normalizeSystemPresetCharacterId = (
  presetId: string | undefined,
  characterId: unknown,
) => {
  if (!presetId || typeof characterId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.characters.some((character) =>
    character.id === characterId
  )
    ? characterId
    : undefined;
};

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

const normalizeRoomPresentation = ({
  presentation,
  presentationProfileId,
}: {
  presentation?: unknown;
  presentationProfileId?: unknown;
}) => normalizeTavernPresentation(
  presentation ?? (presentationProfileId ? { profileId: presentationProfileId } : undefined),
);

const materializeTavernMessage = (
  message: TavernMessage,
  presentationProfileId: TavernMessage["presentationProfileId"],
): TavernMessage => {
  const nextMessage = {
    ...message,
    presentationProfileId: message.presentationProfileId ?? presentationProfileId,
  };

  return {
    ...nextMessage,
    kind: nextMessage.kind ?? inferTavernMessageKind({
      role: nextMessage.role,
      presentationProfileId: nextMessage.presentationProfileId,
    }),
    segments: nextMessage.segments ?? buildTavernMessageSegments(nextMessage),
  };
};

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

const cloneTavernDirectorProfile = (
  profile: TavernDirectorProfile | undefined,
): TavernDirectorProfile | undefined => profile
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

const cloneDefaultRoomSettings = (): TavernRoomSettings => ({
  ...DEFAULT_TAVERN_ROOM_SETTINGS,
  interactionQualityRuleIds: [...DEFAULT_TAVERN_ROOM_SETTINGS.interactionQualityRuleIds],
  directorNarrativeControl: { ...DEFAULT_TAVERN_ROOM_SETTINGS.directorNarrativeControl },
  continuation: { ...DEFAULT_TAVERN_ROOM_SETTINGS.continuation },
  replyOptions: { ...DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions },
  statusTracking: { ...DEFAULT_TAVERN_ROOM_SETTINGS.statusTracking },
  randomEvents: { ...DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents },
  illustrationHints: { ...DEFAULT_TAVERN_ROOM_SETTINGS.illustrationHints },
  directorScheduling: {
    ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling,
    directorOnlyPhaseValues: [...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.directorOnlyPhaseValues],
    speakerMotivation: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation,
      rules: DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation.rules.map((rule) => ({ ...rule })),
    },
    profile: cloneTavernDirectorProfile(DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.profile),
    fixedOrder: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder,
      phaseValues: [...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder.phaseValues],
    },
  },
  informationPolicy: {
    ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy,
    hiddenFacts: { ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.hiddenFacts },
    roleAssignment: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment,
      rolePool: DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment.rolePool.map((role) => ({ ...role })),
    },
  },
});

const normalizeInformationRevealMode = (value: unknown) =>
  value === "sceneOutcome" || value === "never" || value === "manual"
    ? value
    : "manual";

const normalizeRoleAssignmentPool = (
  value: unknown,
): TavernRoomSettings["informationPolicy"]["roleAssignment"]["rolePool"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (!label) {
      return [];
    }

    const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const count = typeof candidate.count === "number" && Number.isFinite(candidate.count)
      ? Math.min(20, Math.max(1, Math.round(candidate.count)))
      : 1;
    const description = typeof candidate.description === "string"
      ? candidate.description.trim()
      : "";
    const factionId = typeof candidate.factionId === "string"
      ? candidate.factionId.trim()
      : "";
    const factionLabel = typeof candidate.factionLabel === "string"
      ? candidate.factionLabel.trim()
      : "";

    return [{
      id: rawId || `role-${index + 1}`,
      label,
      ...(description ? { description } : {}),
      ...(factionId ? { factionId } : {}),
      ...(factionLabel ? { factionLabel } : {}),
      count,
    }];
  });
};

const normalizeInformationPolicy = (
  value: unknown,
): TavernRoomSettings["informationPolicy"] => {
  const defaults = cloneDefaultRoomSettings().informationPolicy;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["informationPolicy"]>;
  const hiddenFacts = candidate.hiddenFacts && typeof candidate.hiddenFacts === "object"
    ? candidate.hiddenFacts as Partial<TavernRoomSettings["informationPolicy"]["hiddenFacts"]>
    : {};
  const roleAssignment = candidate.roleAssignment && typeof candidate.roleAssignment === "object"
    ? candidate.roleAssignment as Partial<TavernRoomSettings["informationPolicy"]["roleAssignment"]>
    : {};
  const roleAssignmentOpening = roleAssignment.opening && typeof roleAssignment.opening === "object"
    ? roleAssignment.opening as Partial<TavernRoomSettings["informationPolicy"]["roleAssignment"]["opening"]>
    : {};
  const mode = candidate.mode === "mystery" ||
      candidate.mode === "social_deduction" ||
      candidate.mode === "custom" ||
      candidate.mode === "open"
    ? candidate.mode
    : defaults.mode;
  const uiDefaultView = candidate.uiDefaultView === "public" ||
      candidate.uiDefaultView === "director" ||
      candidate.uiDefaultView === "reveal"
    ? candidate.uiDefaultView
    : defaults.uiDefaultView;
  const defaultVisibility = hiddenFacts.defaultVisibility === "hidden" ||
      hiddenFacts.defaultVisibility === "debug" ||
      hiddenFacts.defaultVisibility === "director"
    ? hiddenFacts.defaultVisibility
    : defaults.hiddenFacts.defaultVisibility;

  return {
    mode,
    uiDefaultView,
    hideCharacterThoughts: Boolean(candidate.hideCharacterThoughts),
    revealThoughts: normalizeInformationRevealMode(candidate.revealThoughts),
    hiddenFacts: {
      enabled: Boolean(hiddenFacts.enabled),
      defaultVisibility,
      reveal: normalizeInformationRevealMode(hiddenFacts.reveal),
    },
    roleAssignment: {
      enabled: Boolean(roleAssignment.enabled),
      strategy: roleAssignment.strategy === "director_random" ? "director_random" : "manual",
      includeUser: roleAssignment.includeUser !== false,
      revealToAssignedCharacter: roleAssignment.revealToAssignedCharacter !== false,
      revealFactionMembers: roleAssignment.revealFactionMembers !== false,
      rolePool: normalizeRoleAssignmentPool(roleAssignment.rolePool),
      opening: {
        autoStart: Boolean(roleAssignmentOpening.autoStart),
        publicEventType: typeof roleAssignmentOpening.publicEventType === "string"
          ? roleAssignmentOpening.publicEventType.trim().slice(0, 80)
          : "",
        ...(roleAssignmentOpening.publicEventValue !== undefined
          ? { publicEventValue: normalizeStatusValue(roleAssignmentOpening.publicEventValue) }
          : {}),
        globalStatusPatches: Array.isArray(roleAssignmentOpening.globalStatusPatches)
          ? roleAssignmentOpening.globalStatusPatches.flatMap((patch) => {
              if (!patch || typeof patch !== "object") {
                return [];
              }
              const record = patch as Record<string, unknown>;
              const statusId = typeof record.statusId === "string" ? record.statusId.trim() : "";
              if (!statusId) {
                return [];
              }
              return [{
                statusId,
                value: normalizeStatusValue(record.value),
              }];
            }).slice(0, 12)
          : [],
      },
    },
  };
};

const normalizeStringList = (value: unknown, maxItems = 12) => Array.isArray(value)
  ? [...new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []))]
      .slice(0, maxItems)
  : [];

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

const normalizeCharacterRelationships = (
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

const normalizeSceneRelationshipOverrides = (
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

const normalizeDirectorScheduling = (
  value: unknown,
  options: {
    characters?: TavernCharacter[];
    characterIds?: string[];
    mapCharacterId?: (characterId: string) => string | undefined;
    profileSource?: TavernDirectorProfile["source"];
    updatedAt?: number;
  } = {},
): TavernRoomSettings["directorScheduling"] => {
  const defaults = cloneDefaultRoomSettings().directorScheduling;
  const defaultsWithProfile = options.characters?.length
    ? {
        ...defaults,
        profile: createTavernDirectorProfileFromCharacters({
          characters: options.characters,
          source: options.profileSource ?? "system",
          updatedAt: options.updatedAt,
        }),
      }
    : defaults;
  if (!value || typeof value !== "object") {
    return defaultsWithProfile;
  }

  const candidate = value as Partial<TavernRoomSettings["directorScheduling"]>;
  const fixedOrder = candidate.fixedOrder && typeof candidate.fixedOrder === "object"
    ? candidate.fixedOrder as Partial<TavernRoomSettings["directorScheduling"]["fixedOrder"]>
    : {};
  const speakerMotivation = candidate.speakerMotivation && typeof candidate.speakerMotivation === "object"
    ? candidate.speakerMotivation as Partial<TavernRoomSettings["directorScheduling"]["speakerMotivation"]>
    : {};
  const targetedReplyPolicy = candidate.targetedReplyPolicy === "director" ||
      candidate.targetedReplyPolicy === "prefer" ||
      candidate.targetedReplyPolicy === "exclusive" ||
      candidate.targetedReplyPolicy === "include"
    ? candidate.targetedReplyPolicy
    : defaults.targetedReplyPolicy;
  const autoContinuation = candidate.autoContinuation === "disabled" ||
      candidate.autoContinuation === "disabledForFixedOrder" ||
      candidate.autoContinuation === "enabled"
    ? candidate.autoContinuation
    : defaults.autoContinuation;

  return {
    targetedReplyPolicy,
    maxExtraSpeakersOnTargetedReply: clampInteger(
      candidate.maxExtraSpeakersOnTargetedReply,
      defaults.maxExtraSpeakersOnTargetedReply,
      0,
      5,
    ),
    allowDirectorOnly: Boolean(candidate.allowDirectorOnly),
    directorOnlyPhaseStatusId: typeof candidate.directorOnlyPhaseStatusId === "string"
      ? candidate.directorOnlyPhaseStatusId.trim()
      : "",
    directorOnlyPhaseValues: normalizeStringList(candidate.directorOnlyPhaseValues),
    speakerMotivation: {
      enabled: speakerMotivation.enabled !== false,
      maxMotivatedSpeakers: clampInteger(
        speakerMotivation.maxMotivatedSpeakers,
        defaults.speakerMotivation.maxMotivatedSpeakers,
        0,
        5,
      ),
      rules: Array.isArray(speakerMotivation.rules)
        ? speakerMotivation.rules.flatMap((item, index) => {
            if (!item || typeof item !== "object") {
              return [];
            }
            const record = item as Record<string, unknown>;
            const label = typeof record.label === "string" ? record.label.trim() : "";
            const when = typeof record.when === "string" ? record.when.trim() : "";
            const instruction = typeof record.instruction === "string" ? record.instruction.trim() : "";
            if (!label || !when || !instruction) {
              return [];
            }
            const rawId = typeof record.id === "string" ? record.id.trim() : "";
            return [{
              id: rawId || `speaker-motivation-${index + 1}`,
              label: label.slice(0, 80),
              when: when.slice(0, 240),
              priority: clampInteger(record.priority, 50, 0, 100),
              instruction: instruction.slice(0, 360),
            }];
          }).slice(0, 12)
        : defaults.speakerMotivation.rules.map((rule) => ({ ...rule })),
    },
    profile: normalizeTavernDirectorProfile(candidate.profile, {
      characters: options.characters,
      characterIds: options.characterIds,
      mapCharacterId: options.mapCharacterId,
      source: options.profileSource,
      updatedAt: options.updatedAt,
    }),
    fixedOrder: {
      enabled: Boolean(fixedOrder.enabled),
      phaseStatusId: typeof fixedOrder.phaseStatusId === "string"
        ? fixedOrder.phaseStatusId.trim()
        : "",
      phaseValues: normalizeStringList(fixedOrder.phaseValues),
      stopAfterRound: Boolean(fixedOrder.stopAfterRound),
      includeUser: Boolean(fixedOrder.includeUser),
      userPosition: fixedOrder.userPosition === "last" ? "last" : "first",
    },
    autoContinuation,
    instruction: typeof candidate.instruction === "string"
      ? candidate.instruction.trim().slice(0, 1200)
      : "",
  };
};

const normalizeDirectorNarrativeControl = (
  value: unknown,
): TavernRoomSettings["directorNarrativeControl"] => {
  const defaults = cloneDefaultRoomSettings().directorNarrativeControl;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["directorNarrativeControl"]>;
  return {
    agencyMode: candidate.agencyMode === "player_protagonist" ||
        candidate.agencyMode === "story_directive" ||
        candidate.agencyMode === "scene_drive"
      ? candidate.agencyMode
      : defaults.agencyMode,
    responseScale: candidate.responseScale === "focused" ||
        candidate.responseScale === "balanced" ||
        candidate.responseScale === "ensemble"
      ? candidate.responseScale
      : defaults.responseScale,
    narratorPressure: candidate.narratorPressure === "low" ||
        candidate.narratorPressure === "balanced" ||
        candidate.narratorPressure === "high"
      ? candidate.narratorPressure
      : defaults.narratorPressure,
    eventInterruption: candidate.eventInterruption === "off" ||
        candidate.eventInterruption === "auto" ||
        candidate.eventInterruption === "forceOnStall"
      ? candidate.eventInterruption
      : defaults.eventInterruption,
    userActionConsequence: candidate.userActionConsequence === "light" ||
        candidate.userActionConsequence === "visible" ||
        candidate.userActionConsequence === "strict"
      ? candidate.userActionConsequence
      : defaults.userActionConsequence,
    mainHook: candidate.mainHook === "off" ||
        candidate.mainHook === "auto" ||
        candidate.mainHook === "forceOnStall"
      ? candidate.mainHook
      : defaults.mainHook,
    qnaBreak: candidate.qnaBreak === "off" ||
        candidate.qnaBreak === "auto" ||
        candidate.qnaBreak === "aggressive"
      ? candidate.qnaBreak
      : defaults.qnaBreak,
  };
};

const normalizeRoomSettings = (
  value: unknown,
  options: {
    characters?: TavernCharacter[];
    characterIds?: string[];
    mapCharacterId?: (characterId: string) => string | undefined;
    profileSource?: TavernDirectorProfile["source"];
    updatedAt?: number;
  } = {},
): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    const defaults = cloneDefaultRoomSettings();
    return {
      ...defaults,
      directorScheduling: normalizeDirectorScheduling(undefined, options),
    };
  }

  const candidate = value as Partial<TavernRoomSettings>;
  const continuation = candidate.continuation && typeof candidate.continuation === "object"
    ? candidate.continuation as Partial<TavernRoomSettings["continuation"]>
    : {};
  const replyOptions = candidate.replyOptions && typeof candidate.replyOptions === "object"
    ? candidate.replyOptions as Partial<TavernRoomSettings["replyOptions"]>
    : {};
  const statusTracking = candidate.statusTracking && typeof candidate.statusTracking === "object"
    ? candidate.statusTracking as Partial<TavernRoomSettings["statusTracking"]>
    : {};
  const randomEvents = candidate.randomEvents && typeof candidate.randomEvents === "object"
    ? candidate.randomEvents as Partial<TavernRoomSettings["randomEvents"]>
    : {};
  const illustrationHints = candidate.illustrationHints && typeof candidate.illustrationHints === "object"
    ? candidate.illustrationHints as Partial<TavernRoomSettings["illustrationHints"]>
    : {};
  const probability = typeof randomEvents.probability === "number"
    ? randomEvents.probability
    : DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents.probability;
  return {
    immersiveDescriptionEnabled: candidate.immersiveDescriptionEnabled !== false,
    showExecutionTrace: Boolean(candidate.showExecutionTrace),
    autoAssetExtractionEnabled: Boolean(candidate.autoAssetExtractionEnabled),
    assetExtractionIntervalTurns: clampInteger(
      candidate.assetExtractionIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.assetExtractionIntervalTurns,
      1,
      10,
    ),
    maxAssetDrafts: clampInteger(
      candidate.maxAssetDrafts,
      DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts,
      1,
      20,
    ),
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
    agentKnowledgeCompactIntervalTurns: clampInteger(
      candidate.agentKnowledgeCompactIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.agentKnowledgeCompactIntervalTurns,
      0,
      50,
    ),
    interactionQualityRuleIds: normalizeTavernQualityRuleIds(
      candidate.interactionQualityRuleIds ?? DEFAULT_TAVERN_ROOM_SETTINGS.interactionQualityRuleIds,
    ),
    directorNarrativeControl: normalizeDirectorNarrativeControl(candidate.directorNarrativeControl),
    directorScheduling: normalizeDirectorScheduling(candidate.directorScheduling, options),
    continuation: {
      enabled: continuation.enabled !== false,
      maxAutoContinuationRounds: clampInteger(
        continuation.maxAutoContinuationRounds,
        DEFAULT_TAVERN_ROOM_SETTINGS.continuation.maxAutoContinuationRounds,
        0,
        3,
      ),
      maxSpeakersPerContinuation: clampInteger(
        continuation.maxSpeakersPerContinuation,
        DEFAULT_TAVERN_ROOM_SETTINGS.continuation.maxSpeakersPerContinuation,
        1,
        3,
      ),
      stopWhenUserTargeted: continuation.stopWhenUserTargeted !== false,
    },
    replyOptions: {
      enabled: replyOptions.enabled !== false,
      count: clampInteger(
        replyOptions.count,
        DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions.count,
        1,
        6,
      ),
    },
    statusTracking: {
      enabled: statusTracking.enabled !== false,
      visibleToUser: statusTracking.visibleToUser !== false,
    },
    randomEvents: {
      enabled: Boolean(randomEvents.enabled),
      probability: Math.min(1, Math.max(0, probability)),
    },
    illustrationHints: {
      enabled: Boolean(illustrationHints.enabled),
    },
    informationPolicy: normalizeInformationPolicy(candidate.informationPolicy),
  };
};

const normalizeRoomScenePresetId = (room: Partial<TavernRoom>) => {
  if (room.scenePresetId) {
    return normalizeVisualPresetId(room.scenePresetId);
  }

  return typeof room.title === "string" && room.title.includes("酒馆")
    ? "tavern"
    : DEFAULT_VISUAL_PRESET_ID;
};

const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .flatMap(([key, item]) => {
        const valueText = typeof item === "string" ? item : "";
        return key && valueText ? [[key, valueText]] : [];
      }),
  );
};

const normalizeStatusValue = (value: unknown): string | number | boolean | string[] | null => {
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

const normalizeStringArray = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
  : [];

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

const normalizeStatusSnapshot = (
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

const normalizeStatusDefinitions = (
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

const normalizeStatusRules = (
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

const normalizeProgressViews = (
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

const normalizeProgressTracker = (value: unknown): TavernProgressTrackerSettings => {
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

const normalizeFactEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernFactEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernFactEvent>).id === "string")
    )
  : [];

const normalizeStatusEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernStatusEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernStatusEvent>).id === "string")
    )
  : [];

const normalizeTaskDefinitions = (
  value: unknown,
  fallback: TavernTaskDefinition[] = DEFAULT_TAVERN_TASK_DEFINITIONS,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernTaskDefinition =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernTaskDefinition>).id === "string")
    );
};

const normalizeTaskEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernTaskEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernTaskEvent>).id === "string")
    )
  : [];

const normalizeTaskSnapshot = (value: unknown): Record<string, TavernTaskState> => {
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

const normalizeSceneOutcomes = (
  value: unknown,
  fallback: TavernSceneOutcomeDefinition[] = DEFAULT_TAVERN_SCENE_OUTCOMES,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernSceneOutcomeDefinition =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernSceneOutcomeDefinition>).id === "string")
    );
};

const normalizeOutcomeEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernOutcomeEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernOutcomeEvent>).id === "string")
    )
  : [];

const normalizeProgressCheckpoints = (value: unknown) => Array.isArray(value)
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

const normalizeSceneStatus = (
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

const normalizeCharacterPublicStatuses = (
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

const normalizeCharacterPrivateStatuses = (
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

const normalizePendingInteraction = (
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

const normalizeReplyOption = (value: unknown): TavernReplyOption | null => {
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

const normalizeLorebookKeywords = (value: unknown) => Array.isArray(value)
  ? value
      .flatMap((item) => typeof item === "string" ? [item.trim()] : [])
      .filter(Boolean)
  : [];

const normalizeLorebookEntry = (
  value: unknown,
): TavernLorebookEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernLorebookEntry>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!candidate.id || !title || !content) {
    return null;
  }

  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : now();

  return {
    id: candidate.id,
    title,
    content,
    keywords: normalizeLorebookKeywords(candidate.keywords),
    enabled: candidate.enabled !== false,
    alwaysOn: Boolean(candidate.alwaysOn),
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

const normalizeCharacterMemoryDraftVisibility = (
  value: unknown,
): TavernCharacterMemoryDraft["visibility"] | null => (
  value === "public" || value === "hidden" || value === "character" ? value : null
);

const normalizeSceneMemoryDraftVisibility = (
  value: unknown,
): TavernSceneMemoryDraft["visibility"] | null => (
  value === "public" || value === "hidden" || value === "director" ? value : null
);

const normalizeSceneMemoryDraft = (
  value: unknown,
): TavernSceneMemoryDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernSceneMemoryDraft>;
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  const visibility = normalizeSceneMemoryDraftVisibility(candidate.visibility);
  if (!candidate.id || !note || !visibility) {
    return null;
  }

  return {
    id: candidate.id,
    note,
    visibility,
    secretId: candidate.secretId?.trim() || undefined,
  };
};

const normalizeCharacterMemoryDraft = (
  value: unknown,
): TavernCharacterMemoryDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernCharacterMemoryDraft>;
  const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  const visibility = normalizeCharacterMemoryDraftVisibility(candidate.visibility);
  const revealToCharacterIds = Array.isArray(candidate.revealToCharacterIds)
    ? candidate.revealToCharacterIds.filter((item): item is string =>
        typeof item === "string" && item.trim().length > 0
      )
    : [];
  if (
    !candidate.id ||
    !characterId ||
    !note ||
    !visibility ||
    (visibility === "character" && revealToCharacterIds.length === 0)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    characterId,
    note,
    visibility,
    secretId: candidate.secretId?.trim() || undefined,
    revealToCharacterIds,
  };
};

const normalizeLorebookDraft = (
  value: unknown,
): TavernLorebookDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernLorebookDraft>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!candidate.id || !title || !content) {
    return null;
  }

  return {
    id: candidate.id,
    title,
    content,
    keywords: normalizeLorebookKeywords(candidate.keywords),
    alwaysOn: Boolean(candidate.alwaysOn),
  };
};

const normalizeAssetDraft = (
  value: unknown,
): TavernAssetDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernAssetDraft>;
  if (!candidate.id) {
    return null;
  }

  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : now();
  const sourceMessageIds = Array.isArray(candidate.sourceMessageIds)
    ? candidate.sourceMessageIds.filter((item): item is string => typeof item === "string")
    : [];
  const characterMemories = Array.isArray(candidate.characterMemories)
    ? candidate.characterMemories
        .map(normalizeCharacterMemoryDraft)
        .filter((draft): draft is TavernCharacterMemoryDraft => Boolean(draft))
    : [];
  const sceneMemories = Array.isArray(candidate.sceneMemories)
    ? candidate.sceneMemories
        .map(normalizeSceneMemoryDraft)
        .filter((draft): draft is TavernSceneMemoryDraft => Boolean(draft))
    : [];
  const lorebookEntries = Array.isArray(candidate.lorebookEntries)
    ? candidate.lorebookEntries
        .map(normalizeLorebookDraft)
        .filter((draft): draft is TavernLorebookDraft => Boolean(draft))
    : [];

  if (
    sceneMemories.length === 0 &&
    characterMemories.length === 0 &&
    lorebookEntries.length === 0
  ) {
    return null;
  }

  return {
    id: candidate.id,
    sourceMessageIds,
    sceneMemories,
    characterMemories,
    lorebookEntries,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

const normalizeIllustrationHint = (
  value: unknown,
): TavernIllustrationHint | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernIllustrationHint>;
  const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
  if (!candidate.id || !prompt) {
    return null;
  }

  return {
    id: candidate.id,
    turnId: typeof candidate.turnId === "string" && candidate.turnId.trim()
      ? candidate.turnId
      : undefined,
    source: "director",
    prompt,
    sourceMessageIds: Array.isArray(candidate.sourceMessageIds)
      ? candidate.sourceMessageIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : now(),
  };
};

const normalizeIllustrationHints = (value: unknown): TavernIllustrationHint[] => Array.isArray(value)
  ? value
      .map(normalizeIllustrationHint)
      .filter((hint): hint is TavernIllustrationHint => Boolean(hint))
  : [];

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

const defaultStoryStageTitle = "第一阶段";

const createTavernStoryStage = (
  input: Partial<TavernStoryStage> = {},
): TavernStoryStage => ({
  id: input.id || createId("stage"),
  title: input.title?.trim() || defaultStoryStageTitle,
  summary: input.summary?.trim() || undefined,
  routeNodeId: input.routeNodeId?.trim() || undefined,
  order: typeof input.order === "number" ? input.order : 0,
  collapsed: Boolean(input.collapsed),
});

const normalizeTavernStoryNodeType = (value: unknown): TavernStoryNode["type"] => {
  if (value === "failure" || value === "ending") {
    return value;
  }
  return "normal";
};

const normalizeTavernStoryPathRole = (value: unknown): TavernStoryNode["pathRole"] => (
  value === "branch" ? "branch" : "main"
);

const createTavernStoryNode = (
  input: Partial<TavernStoryNode> & {
    stageId: string;
    title: string;
  },
): TavernStoryNode => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : now();

  return {
    id: input.id || createId("node"),
    stageId: input.stageId,
    sceneId: input.sceneId?.trim() || undefined,
    title: input.title.trim() || "未命名节点",
    type: normalizeTavernStoryNodeType(input.type),
    pathRole: normalizeTavernStoryPathRole(input.pathRole),
    position: {
      x: typeof input.position?.x === "number" ? input.position.x : 120,
      y: typeof input.position?.y === "number" ? input.position.y : 120,
    },
    status: input.status ?? (input.sceneId ? "ready" : "draft"),
    createdAt: typeof input.createdAt === "number" ? input.createdAt : updatedAt,
    updatedAt,
  };
};

const createTavernStoryEdge = (
  input: Partial<TavernStoryEdge> & {
    fromNodeId: string;
    toNodeId: string;
  },
): TavernStoryEdge => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : now();

  return {
    id: input.id || createId("edge"),
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    label: input.label?.trim() || "继续",
    reason: input.reason?.trim() || undefined,
    isDefault: Boolean(input.isDefault),
    priority: typeof input.priority === "number" ? input.priority : 0,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : updatedAt,
    updatedAt,
  };
};

const createDefaultStoryGraph = (
  scenes: TavernScene[],
): TavernStoryGraph => {
  const stage = createTavernStoryStage({ title: defaultStoryStageTitle, order: 0 });
  const nodes = scenes.map((scene, index) =>
    createTavernStoryNode({
      stageId: stage.id,
      sceneId: scene.id,
      title: scene.title || `节点 ${index + 1}`,
      type: index === scenes.length - 1 && scenes.length > 1 ? "ending" : "normal",
      pathRole: "main",
      position: {
        x: 120 + index * 240,
        y: 160,
      },
      status: "ready",
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
    })
  );
  const entryNode = nodes[0] ??
    createTavernStoryNode({
      stageId: stage.id,
      title: "入口节点",
      status: "draft",
    });
  const edges = nodes.slice(0, -1).map((node, index) =>
    createTavernStoryEdge({
      fromNodeId: node.id,
      toNodeId: nodes[index + 1].id,
      label: "继续",
      isDefault: true,
      priority: index,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    })
  );

  return {
    version: 1,
    entryNodeId: entryNode.id,
    activeNodeId: entryNode.id,
    stages: [{ ...stage, routeNodeId: nodes[nodes.length - 1]?.id ?? entryNode.id }],
    nodes: nodes.length > 0 ? nodes : [entryNode],
    edges,
  };
};

const createSceneInstanceFromScene = ({
  roomId,
  scene,
  node,
  runId,
  pathNodeIds,
  pathEdgeIds,
}: {
  roomId: string;
  scene: TavernScene;
  node: TavernStoryNode;
  runId: string;
  pathNodeIds: string[];
  pathEdgeIds: string[];
}): TavernSceneInstance => {
  const id = createRouteScopedSceneInstanceId(roomId, pathNodeIds);
  return {
    ...scene,
    id,
    sceneId: scene.id,
    nodeId: node.id,
    runIds: [runId],
    pathNodeIds,
    pathEdgeIds,
    promptOverrides: normalizeScenePromptOverrides(),
    memoryLayers: createEmptySceneMemoryLayers({
      required: scene.memory,
      updatedAt: scene.updatedAt,
    }),
    characterMemoryLayers: Object.fromEntries(
      Object.entries(scene.characterMemories).map(([characterId, memory]) => [
        characterId,
        createEmptyCharacterMemoryLayers({
          required: memory,
          updatedAt: scene.updatedAt,
        }),
      ]),
    ),
    secretReveals: [],
  };
};

const buildSceneInstancesForRuns = ({
  roomId,
  graph,
  scenes,
  runs,
  existingInstances = [],
}: {
  roomId: string;
  graph: TavernStoryGraph;
  scenes: TavernScene[];
  runs: TavernStoryRun[];
  existingInstances?: TavernSceneInstance[];
}) => {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const existingById = new Map(existingInstances.map((instance) => [instance.id, instance]));
  const instanceById = new Map<string, TavernSceneInstance>();

  runs.forEach((run) => {
    run.pathNodeIds.forEach((nodeId, index) => {
      const node = nodeById.get(nodeId);
      const scene = node?.sceneId ? sceneById.get(node.sceneId) : scenes[0];
      if (!node || !scene) {
        return;
      }

      const pathNodeIds = run.pathNodeIds.slice(0, index + 1);
      const pathEdgeIds = run.pathEdgeIds.slice(0, index);
      const instanceId = createRouteScopedSceneInstanceId(roomId, pathNodeIds);
      const existing = existingById.get(instanceId);
      const current = instanceById.get(instanceId);
      const instance = current ?? existing ?? createSceneInstanceFromScene({
        roomId,
        scene,
        node,
        runId: run.id,
        pathNodeIds,
        pathEdgeIds,
      });

      instanceById.set(instanceId, {
        ...instance,
        sceneId: scene.id,
        nodeId: node.id,
        runIds: Array.from(new Set([...instance.runIds, run.id])),
        pathNodeIds,
        pathEdgeIds,
        promptOverrides: normalizeScenePromptOverrides(instance.promptOverrides),
        memoryLayers: createEmptySceneMemoryLayers(instance.memoryLayers),
        characterMemoryLayers: Object.fromEntries(
          Object.entries(instance.characterMemoryLayers ?? {}).map(([characterId, layers]) => [
            characterId,
            createEmptyCharacterMemoryLayers(layers),
          ]),
        ),
        secretReveals: Array.isArray(instance.secretReveals) ? instance.secretReveals : [],
      });
    });
  });

  return [...instanceById.values()];
};

const resolveActiveSceneInstance = (
  room: Pick<
    TavernRoom,
    "id" | "activeRunId" | "activeSceneInstanceId" | "storyRuns" | "storyGraph" | "sceneInstances"
  >,
) => {
  const explicitInstance = room.sceneInstances.find((instance) =>
    instance.id === room.activeSceneInstanceId
  );
  if (explicitInstance) {
    return explicitInstance;
  }

  const activeRun = resolveActiveRun(room.storyRuns, room.activeRunId);
  const pathNodeIds = resolveRunNodePrefix(activeRun, room.storyGraph.activeNodeId);
  const scopedInstanceId = pathNodeIds.length > 0
    ? createRouteScopedSceneInstanceId(room.id, pathNodeIds)
    : "";
  return room.sceneInstances.find((instance) => instance.id === scopedInstanceId) ??
    room.sceneInstances[0] ??
    null;
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

const normalizeStoryGraph = (
  value: unknown,
  scenes: TavernScene[],
): TavernStoryGraph => {
  if (!value || typeof value !== "object") {
    return createDefaultStoryGraph(scenes);
  }

  const candidate = value as Partial<TavernStoryGraph>;
  const stages = Array.isArray(candidate.stages)
    ? candidate.stages
        .map((stage) => createTavernStoryStage(stage))
        .filter((stage) => stage.title.trim())
        .sort((left, right) => left.order - right.order)
        .map((stage, index) => ({ ...stage, order: index }))
    : [];
  const normalizedStages = stages.length > 0
    ? stages
    : createDefaultStoryGraph(scenes).stages;
  const stageIds = new Set(normalizedStages.map((stage) => stage.id));
  const fallbackStageId = normalizedStages[0]?.id ?? createId("stage");
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes
        .map((node) => {
          const rawNode = node as Partial<TavernStoryNode>;
          const title = typeof rawNode.title === "string" ? rawNode.title : "";
          if (!title.trim()) {
            return null;
          }

          return createTavernStoryNode({
            ...rawNode,
            stageId: rawNode.stageId && stageIds.has(rawNode.stageId)
              ? rawNode.stageId
              : fallbackStageId,
            sceneId: rawNode.sceneId && sceneIds.has(rawNode.sceneId)
              ? rawNode.sceneId
              : undefined,
            title,
          });
        })
        .filter((node): node is TavernStoryNode => Boolean(node))
    : [];
  const normalizedNodes = nodes.length > 0
    ? nodes
    : createDefaultStoryGraph(scenes).nodes;
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  const validatedStages = normalizedStages.map((stage) => ({
    ...stage,
    routeNodeId: stage.routeNodeId && nodeIds.has(stage.routeNodeId)
      ? stage.routeNodeId
      : undefined,
  }));
  const edges = Array.isArray(candidate.edges)
    ? candidate.edges
        .map((edge) => {
          const rawEdge = edge as Partial<TavernStoryEdge>;
          if (
            !rawEdge.fromNodeId ||
            !rawEdge.toNodeId ||
            !nodeIds.has(rawEdge.fromNodeId) ||
            !nodeIds.has(rawEdge.toNodeId) ||
            rawEdge.fromNodeId === rawEdge.toNodeId
          ) {
            return null;
          }

          return createTavernStoryEdge({
            ...rawEdge,
            fromNodeId: rawEdge.fromNodeId,
            toNodeId: rawEdge.toNodeId,
          });
        })
        .filter((edge): edge is TavernStoryEdge => Boolean(edge))
    : [];
  const entryNodeId = candidate.entryNodeId && nodeIds.has(candidate.entryNodeId)
    ? candidate.entryNodeId
    : normalizedNodes[0]?.id ?? "";
  const activeNodeId = candidate.activeNodeId && nodeIds.has(candidate.activeNodeId)
    ? candidate.activeNodeId
    : entryNodeId;

  return {
    version: 1,
    entryNodeId,
    activeNodeId,
    stages: validatedStages,
    nodes: normalizedNodes,
    edges,
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
