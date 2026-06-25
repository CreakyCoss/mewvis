import {
  projectTavernSceneFieldsOntoRoom,
  projectTavernSceneOntoRoom,
} from "../runtime/active-scene-runtime";
import {
  mapTavernCharacterRelationships,
  mapTavernSceneOutcomeDefinitions,
  mapTavernSceneRelationshipOverrides,
  mapTavernTaskDefinitions,
} from "../normalizers/character-id-mapping";
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
} from "../normalizers/generated-preset-normalizers";
import {
  createTavernId as createId,
  now,
} from "../ids";
import {
  materializeTavernMessage,
} from "../message";
import {
  normalizeRoomPresentation,
} from "../presentation/presentation-settings";
import {
  normalizeTavernQualityRuleIds,
  normalizeTavernRuleCompositionId,
} from "../prompt-registry/rule-layers/resolver";
import {
  normalizeTavernSystemNarrativePresetSettings,
} from "../prompt-registry/system-narrative-styles";
import {
  createDefaultTavernPromptSettings,
  normalizeTavernPromptSettings,
} from "../prompt-registry/text-blocks";
import {
  normalizeTavernPromptStyleId,
} from "../presentation/prompt-styles";
import {
  normalizeReplyMode,
} from "../normalizers/reply-mode";
import {
  normalizeSceneRelationshipOverrides,
} from "../normalizers/relationships";
import {
  normalizeRoomCharacterConfigs,
} from "../normalizers/room-character-configs";
import {
  normalizeRoomSettings,
} from "../normalizers/room-settings";
import {
  buildTavernScene,
  defaultSceneTitle,
} from "../story-model/scene-builder";
import {
  normalizeCharacterPrivateStatuses,
  normalizeCharacterPublicStatuses,
  normalizeSceneStatus,
} from "../normalizers/scene-state-normalizers";
import {
  normalizeStoryGraph,
} from "../story-model/story-graph";
import {
  createTavernStoryBinding,
} from "../story-model/story-binding";
import {
  createPresetLorebookEntry,
  mergeLorebookEntries,
} from "./system-preset-assets";
import {
  normalizeProgressTracker,
  normalizeProgressViews,
  normalizeSceneOutcomes,
  normalizeStatusDefinitions,
  normalizeStatusRules,
  normalizeStatusSnapshot,
  normalizeTaskDefinitions,
} from "../normalizers/status-normalizers";
import type {
  TavernFactEvent,
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernGeneratedPresetScene,
  TavernLorebookEntry,
  TavernMessage,
  TavernRoom,
  TavernRoomSettings,
} from "../types";

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
  const roomIdentity = {
    id: roomId,
    workspaceId,
    locked: false,
    title,
    creationSource: options.creationSource ?? "agent_generated" as const,
  };
  const roomPrompt = {
    presentation,
    prompt: normalizeTavernPromptSettings(roomInput.prompt, createDefaultTavernPromptSettings({
      presentationProfileId: presentation.profileId,
      promptStyleId: normalizeTavernPromptStyleId(roomInput.promptStyleId),
      systemNarrativePresetId: generatedSystemNarrative.presetId,
      ruleCompositionId: normalizeTavernRuleCompositionId(generatedPromptSettings.platformStyleId),
      qualityRuleIds: normalizeTavernQualityRuleIds(generatedPromptSettings.qualityRuleIds),
      immersiveDescriptionEnabled: true,
    })),
  };
  const roomStory = {
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
  };
  const roomProgress = {
    statusDefinitions: normalizeStatusDefinitions(roomInput.statusDefinitions),
    statusRules: normalizeStatusRules(roomInput.statusRules),
    progressViews: normalizeProgressViews(roomInput.progressViews),
    progressTracker: normalizeProgressTracker(roomInput.progressTracker),
    taskDefinitions: normalizeTaskDefinitions(
      mapTavernTaskDefinitions(roomInput.taskDefinitions, mapGeneratedCharacterId),
    ),
    taskEvents: scene.taskEvents,
    taskSnapshot: scene.taskSnapshot,
    sceneOutcomes: normalizeSceneOutcomes(
      mapTavernSceneOutcomeDefinitions(roomInput.sceneOutcomes, mapGeneratedCharacterId),
    ),
    outcomeEvents: scene.outcomeEvents,
  };
  const roomCharacters = {
    characterConfigs: roomCharacterConfigs,
    characterMemories: roomCharacterMemories,
    localCharacters: characters,
    characterIds: roomCharacterIds,
    activeCharacterId: roomActiveCharacterId,
  };
  const roomAssets = {
    lorebookEntries: sharedLorebookEntries,
    illustrationHints: scene.illustrationHints,
    assetDrafts: [],
  };
  const roomRuntimeSettings = {
    replyMode: normalizeReplyMode(roomInput.replyMode),
    userPersonaName: trimGeneratedString(roomInput.userPersonaName) || "我",
    settings: normalizeRoomSettings(roomInput.settings, {
      characters,
      characterIds: roomCharacterIds,
      mapCharacterId: mapGeneratedCharacterId,
      profileSource: "generated" as const,
      updatedAt: createdAt,
    }),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  };
  const room: TavernRoom = projectTavernSceneOntoRoom({
    ...roomIdentity,
    ...roomPrompt,
    ...roomStory,
    ...projectTavernSceneFieldsOntoRoom(scene),
    ...roomProgress,
    ...roomCharacters,
    ...roomAssets,
    ...roomRuntimeSettings,
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
