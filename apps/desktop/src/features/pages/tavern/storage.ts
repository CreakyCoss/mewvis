import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  DEFAULT_VISUAL_PRESET_ID,
} from "@/features/pages/tavern/visual-presets";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCharacterRelationship,
  TavernLorebookEntry,
  TavernMessage,
  TavernFactEvent,
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernGeneratedPresetScene,
  TavernPendingInteraction,
  TavernReplyMode,
  TavernReplyOption,
  TavernRoom,
  TavernRoomSettings,
  TavernState,
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
  normalizeIllustrationHints,
  normalizeLorebookEntry,
} from "./asset-normalizers";
import {
  createPresetAssetDraft,
  createPresetLorebookEntry,
  mergeLorebookEntries,
} from "./system-preset-assets";
import {
  normalizeRoomCharacterConfigs,
  roomCharacterMemoriesFromConfigs,
} from "./room-character-configs";
import {
  createTavernCharacterFromSystemPresetCharacter,
  normalizeTavernCharacter,
} from "./character-normalizers";
import {
  createGeneratedCharacter,
  createGeneratedFactEvent,
  normalizeGeneratedCharacterIds,
  normalizeGeneratedCharacterObjectRecord,
  normalizeGeneratedStatusSnapshot,
  normalizeGeneratedStringRecord,
  rememberGeneratedCharacterKey,
  resolveGeneratedCharacterId,
  trimGeneratedString,
} from "./generated-preset-normalizers";
import {
  buildTavernScene,
  defaultSceneTitle,
  normalizeRoomScenePresetId,
} from "./scene-builder";
import {
  mapTavernCharacterRelationships,
  mapTavernSceneOutcomeDefinitions,
  mapTavernSceneRelationshipOverrides,
  mapTavernStatusSnapshot,
  mapTavernTaskDefinitions,
} from "./character-id-mapping";
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
  createDefaultStoryGraph,
  normalizeStoryGraph,
} from "./story-graph";
import {
  createTavernStoryBinding,
  normalizeTavernStoryBinding,
} from "./story-binding";
import {
  DEFAULT_TAVERN_PROGRESS_TRACKER,
  DEFAULT_TAVERN_PROGRESS_VIEWS,
  DEFAULT_TAVERN_STATUS_DEFINITIONS,
  DEFAULT_TAVERN_STATUS_RULES,
} from "./defaults";
import {
  projectTavernSceneOntoRoom,
} from "./active-scene-runtime";
import {
  getTavernSystemPreset,
  normalizeSystemPresetId,
  tavernSystemPresets,
} from "./system-preset-registry";
import type {
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
  createTavernScene,
} from "./scene-builder";
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
  parseTavernGeneratedPresetJsonText,
} from "./generated-preset-parser";
export {
  addTavernSecretMemoryEntry,
  findTavernSceneInstanceIdForNode,
  getActiveTavernSceneInstance,
  listTavernBranchSecretMemoryEntries,
  loadTavernBranchUpstreamMemory,
  projectTavernSceneOntoRoom,
  revealTavernSecretMemory,
  switchTavernRoomScene,
  switchTavernRoomSceneInstance,
  switchTavernRoomStoryNode,
  syncTavernRoomActiveScene,
  updateTavernActiveCharacterMemoryLayers,
  updateTavernActiveSceneMemoryLayers,
  updateTavernActiveScenePromptOverrides,
} from "./active-scene-runtime";
export type {
  TavernBranchSecretMemoryOption,
  TavernBranchUpstreamMemoryLoadResult,
  TavernSecretMemoryTarget,
} from "./active-scene-runtime";
export {
  getTavernSystemPreset,
  tavernSystemPresets,
} from "./system-preset-registry";
export type {
  TavernSystemPreset,
} from "./system-preset-registry";

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const normalizeReplyMode = (value: unknown): TavernReplyMode =>
  value === "round" || value === "director" ? value : "active";

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
