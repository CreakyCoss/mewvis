import {
  projectTavernSceneOntoRoom,
} from "./active-scene-runtime";
import {
  normalizeAssetDraft,
  normalizeIllustrationHints,
  normalizeLorebookEntry,
} from "./asset-normalizers";
import {
  normalizeTavernCharacter,
} from "./character-normalizers";
import {
  now,
} from "./ids";
import {
  materializeTavernMessage,
} from "./message";
import {
  normalizeStringRecord,
} from "./normalization";
import {
  createDefaultPromptForPresentation,
  normalizeRoomPresentation,
} from "./presentation-settings";
import {
  normalizeTavernPromptSettings,
} from "./prompt-registry/text-blocks";
import {
  normalizeReplyMode,
} from "./reply-mode";
import {
  normalizeSceneRelationshipOverrides,
} from "./relationships";
import {
  normalizeRoomCharacterConfigs,
  roomCharacterMemoriesFromConfigs,
} from "./room-character-configs";
import {
  normalizeRoomSettings,
} from "./room-settings";
import {
  buildTavernScene,
  defaultSceneTitle,
  normalizeRoomScenePresetId,
} from "./scene-builder";
import {
  normalizeCharacterPrivateStatuses,
  normalizeCharacterPublicStatuses,
  normalizePendingInteraction,
  normalizeReplyOption,
  normalizeSceneStatus,
} from "./scene-state-normalizers";
import {
  createDefaultStoryGraph,
  normalizeStoryGraph,
} from "./story-graph";
import {
  normalizeTavernStoryBinding,
} from "./story-binding";
import {
  createTavernRoomFromSystemPreset,
} from "./system-preset-room";
import {
  getTavernSystemPreset,
  normalizeSystemPresetId,
  tavernSystemPresets,
} from "./system-preset-registry";
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
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernLorebookEntry,
  TavernMessage,
  TavernPendingInteraction,
  TavernReplyOption,
  TavernRoom,
  TavernState,
} from "./types";

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
