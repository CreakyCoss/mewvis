import {
  projectTavernSceneOntoRoom,
} from "../runtime/active-scene-runtime";
import {
  normalizeAssetDraft,
  normalizeIllustrationHints,
  normalizeLorebookEntry,
} from "../normalizers/asset-normalizers";
import {
  normalizeTavernCharacter,
} from "../normalizers/character-normalizers";
import {
  now,
} from "../ids";
import {
  materializeTavernMessage,
} from "../message";
import {
  normalizeStringRecord,
} from "../normalizers/normalization";
import {
  createDefaultPromptForPresentation,
  normalizeRoomPresentation,
} from "../presentation/presentation-settings";
import {
  normalizeTavernPromptSettings,
} from "../prompt-registry/text-blocks";
import {
  normalizeReplyMode,
} from "../normalizers/reply-mode";
import {
  normalizeSceneRelationshipOverrides,
} from "../normalizers/relationships";
import {
  normalizeRoomCharacterConfigs,
  roomCharacterMemoriesFromConfigs,
} from "../normalizers/room-character-configs";
import {
  normalizeRoomSettings,
} from "../normalizers/room-settings";
import {
  buildTavernScene,
  defaultSceneTitle,
  normalizeRoomScenePresetId,
} from "../story-model/scene-builder";
import {
  normalizeCharacterPrivateStatuses,
  normalizeCharacterPublicStatuses,
  normalizePendingInteraction,
  normalizeReplyOption,
  normalizeSceneStatus,
} from "../normalizers/scene-state-normalizers";
import {
  createDefaultStoryGraph,
  normalizeStoryGraph,
} from "../story-model/story-graph";
import {
  normalizeTavernStoryBinding,
} from "../story-model/story-binding";
import {
  createTavernRoomFromSystemPreset,
} from "../factories/system-preset-room";
import {
  getTavernSystemPreset,
  normalizeSystemPresetId,
  tavernSystemPresets,
} from "../system-preset-registry";
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
} from "../normalizers/status-normalizers";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernLorebookEntry,
  TavernMessage,
  TavernPendingInteraction,
  TavernReplyOption,
  TavernRoom,
  TavernState,
} from "../types";

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

export const normalizeTavernState = (
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
    const sourceRoom = room as Partial<TavernRoom>;
    const normalizedAt = Date.now();
    const systemPresetId = normalizeSystemPresetId(sourceRoom.systemPresetId);
    const systemPreset = getTavernSystemPreset(systemPresetId);
    const characterMemories = normalizeStringRecord(sourceRoom.characterMemories);
    const characterConfigs = normalizeRoomCharacterConfigs(
      sourceRoom.characterConfigs,
      characterMemories,
    );
    const localCharacters = Array.isArray(sourceRoom.localCharacters)
      ? (sourceRoom.localCharacters ?? [])
          .filter((character): character is TavernCharacter =>
            Boolean(character?.id && character.name)
          )
          .map((character) => normalizeTavernCharacter(character))
      : [];
    const presentation = normalizeRoomPresentation({
      presentation: sourceRoom.presentation,
    });
    const roomIdentity = {
      ...room,
      systemPresetId: systemPreset?.id,
      systemPresetVersion: systemPreset
        ? typeof sourceRoom.systemPresetVersion === "number"
          ? sourceRoom.systemPresetVersion
          : systemPreset.version
        : undefined,
      locked: Boolean(sourceRoom.locked),
      creationSource:
        sourceRoom.creationSource === "quick" ||
        sourceRoom.creationSource === "imported" ||
        sourceRoom.creationSource === "agent_generated"
          ? sourceRoom.creationSource
          : "manual" as const,
    };
    const roomPrompt = {
      presentation,
      prompt: normalizeTavernPromptSettings(
        sourceRoom.prompt,
        createDefaultPromptForPresentation(presentation),
      ),
    };
    const roomStory = {
      storyBinding: normalizeTavernStoryBinding(
        sourceRoom.storyBinding,
        room.id,
        typeof sourceRoom.createdAt === "number" ? sourceRoom.createdAt : normalizedAt,
      ),
      storyOutline: typeof sourceRoom.storyOutline === "string"
        ? sourceRoom.storyOutline ?? ""
        : "",
      storyGoal: typeof sourceRoom.storyGoal === "string"
        ? sourceRoom.storyGoal ?? ""
        : "",
      storyGraph: createDefaultStoryGraph([]),
      storyRuns: Array.isArray(sourceRoom.storyRuns) ? sourceRoom.storyRuns ?? [] : [],
      activeRunId: typeof sourceRoom.activeRunId === "string"
        ? sourceRoom.activeRunId
        : undefined,
      activeSceneInstanceId: typeof sourceRoom.activeSceneInstanceId === "string"
        ? sourceRoom.activeSceneInstanceId
        : undefined,
      sceneInstances: Array.isArray(sourceRoom.sceneInstances)
        ? sourceRoom.sceneInstances ?? []
        : [],
    };
    const roomSceneDraft = {
      scenePresetId: normalizeRoomScenePresetId(room),
      memory: typeof sourceRoom.memory === "string" ? sourceRoom.memory ?? "" : "",
      sceneGoal: typeof sourceRoom.sceneGoal === "string" ? sourceRoom.sceneGoal ?? "" : "",
      scenePlot: typeof sourceRoom.scenePlot === "string" ? sourceRoom.scenePlot ?? "" : "",
      sceneDirection: typeof sourceRoom.sceneDirection === "string" ? sourceRoom.sceneDirection ?? "" : "",
      sceneTransition: typeof sourceRoom.sceneTransition === "string" ? sourceRoom.sceneTransition ?? "" : "",
      relationshipOverrides: normalizeSceneRelationshipOverrides(
        sourceRoom.relationshipOverrides,
        normalizedAt,
      ),
    };
    const characterIds = Array.isArray(sourceRoom.characterIds) ? sourceRoom.characterIds : [];
    const roomSceneState = {
      sceneStatus: normalizeSceneStatus(sourceRoom.sceneStatus, normalizedAt),
      characterPublicStatuses: normalizeCharacterPublicStatuses(
        sourceRoom.characterPublicStatuses,
        characterIds,
        undefined,
        normalizedAt,
      ),
      characterPrivateStatuses: normalizeCharacterPrivateStatuses(
        sourceRoom.characterPrivateStatuses,
        characterIds,
        undefined,
        normalizedAt,
      ),
      pendingInteractions: Array.isArray(sourceRoom.pendingInteractions)
        ? (sourceRoom.pendingInteractions ?? [])
            .map(normalizePendingInteraction)
            .filter((interaction): interaction is TavernPendingInteraction => Boolean(interaction))
        : [],
      replyOptions: Array.isArray(sourceRoom.replyOptions)
        ? (sourceRoom.replyOptions ?? [])
            .map(normalizeReplyOption)
            .filter((option): option is TavernReplyOption => Boolean(option))
        : [],
    };
    const roomProgress = {
      statusDefinitions: normalizeStatusDefinitions(sourceRoom.statusDefinitions),
      statusRules: normalizeStatusRules(sourceRoom.statusRules),
      progressViews: normalizeProgressViews(sourceRoom.progressViews),
      progressTracker: normalizeProgressTracker(sourceRoom.progressTracker),
      factEvents: normalizeFactEvents(sourceRoom.factEvents),
      statusEvents: normalizeStatusEvents(sourceRoom.statusEvents),
      statusSnapshot: normalizeStatusSnapshot(sourceRoom.statusSnapshot, normalizedAt),
      previousStatusSnapshot: sourceRoom.previousStatusSnapshot
        ? normalizeStatusSnapshot(sourceRoom.previousStatusSnapshot, normalizedAt)
        : undefined,
      statusCheckpoints: normalizeProgressCheckpoints(sourceRoom.statusCheckpoints),
      taskDefinitions: normalizeTaskDefinitions(sourceRoom.taskDefinitions),
      taskEvents: normalizeTaskEvents(sourceRoom.taskEvents),
      taskSnapshot: normalizeTaskSnapshot(sourceRoom.taskSnapshot),
      sceneOutcomes: normalizeSceneOutcomes(sourceRoom.sceneOutcomes),
      outcomeEvents: normalizeOutcomeEvents(sourceRoom.outcomeEvents),
    };
    const roomAssets = {
      lorebookEntries: Array.isArray(sourceRoom.lorebookEntries)
        ? (sourceRoom.lorebookEntries ?? [])
            .map(normalizeLorebookEntry)
            .filter((entry): entry is TavernLorebookEntry => Boolean(entry))
        : [],
      assetDrafts: Array.isArray(sourceRoom.assetDrafts)
        ? (sourceRoom.assetDrafts ?? [])
            .map(normalizeAssetDraft)
            .filter((draft): draft is TavernAssetDraft => Boolean(draft))
        : [],
      illustrationHints: normalizeIllustrationHints(sourceRoom.illustrationHints),
    };
    const roomCharacters = {
      characterConfigs,
      characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
      localCharacters,
      characterIds,
      activeCharacterId: sourceRoom.activeCharacterId || "",
    };
    const roomRuntimeSettings = {
      replyMode: normalizeReplyMode(sourceRoom.replyMode),
      userPersonaName: room.userPersonaName || "我",
      settings: normalizeRoomSettings(sourceRoom.settings),
    };
    const normalizedRoom: TavernRoom = {
      ...roomIdentity,
      ...roomPrompt,
      ...roomStory,
      ...roomSceneDraft,
      ...roomSceneState,
      ...roomProgress,
      ...roomAssets,
      ...roomCharacters,
      ...roomRuntimeSettings,
    };
    const normalizedScenes = Array.isArray(sourceRoom.scenes)
      ? (sourceRoom.scenes ?? [])
          .map((scene) => buildTavernScene(scene, normalizedRoom))
      : [];
    const fallbackScene = buildTavernScene({
      title: defaultSceneTitle,
    }, normalizedRoom);
    const scenes = (normalizedScenes.length > 0 ? normalizedScenes : [fallbackScene])
      .sort((left, right) => left.order - right.order)
      .map((scene, index) => ({ ...scene, order: index }));
    const activeSceneId = scenes.some((scene) => scene.id === sourceRoom.activeSceneId)
      ? sourceRoom.activeSceneId
      : scenes[0]?.id;

    return projectTavernSceneOntoRoom({
      ...normalizedRoom,
      storyGraph: normalizeStoryGraph(sourceRoom.storyGraph, scenes),
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
