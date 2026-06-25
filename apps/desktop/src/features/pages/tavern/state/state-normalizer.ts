import {
  projectTavernSceneOntoRoom,
} from "../runtime/active-scene-runtime";
import {
  normalizeLorebookEntry,
} from "../normalizers/asset-normalizers";
import {
  projectTavernSceneFieldsOntoRoom,
} from "../runtime/scene-field-projection";
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
  normalizeRoomSettings,
} from "../normalizers/room-settings";
import {
  buildTavernScene,
} from "../story-model/scene-builder";
import {
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
  normalizeProgressTracker,
  normalizeProgressViews,
  normalizeStatusDefinitions,
  normalizeStatusRules,
} from "../normalizers/status-normalizers";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernMessage,
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
      room.scenes.length > 0 &&
      Array.isArray(room.sceneInstances),
    )
  ).map((room) => {
    const sourceRoom = room as Partial<TavernRoom>;
    const normalizedAt = Date.now();
    const systemPresetId = normalizeSystemPresetId(sourceRoom.systemPresetId);
    const systemPreset = getTavernSystemPreset(systemPresetId);
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
    const scenes = (sourceRoom.scenes ?? [])
      .map((scene) => buildTavernScene(scene))
      .sort((left, right) => left.order - right.order)
      .map((scene, index) => ({ ...scene, order: index }));
    const activeSceneId = scenes.some((scene) => scene.id === sourceRoom.activeSceneId)
      ? sourceRoom.activeSceneId
      : scenes[0].id;
    const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
    const createdAt = typeof sourceRoom.createdAt === "number"
      ? sourceRoom.createdAt
      : normalizedAt;
    const roomIdentity = {
      id: room.id,
      workspaceId: room.workspaceId,
      title: room.title,
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
      createdAt,
      updatedAt: typeof sourceRoom.updatedAt === "number"
        ? sourceRoom.updatedAt
        : normalizedAt,
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
        createdAt,
      ),
      storyOutline: typeof sourceRoom.storyOutline === "string"
        ? sourceRoom.storyOutline ?? ""
        : "",
      storyGoal: typeof sourceRoom.storyGoal === "string"
        ? sourceRoom.storyGoal ?? ""
        : "",
      storyGraph: normalizeStoryGraph(sourceRoom.storyGraph, scenes),
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
      activeSceneId,
      scenes,
    };
    const roomProgress = {
      statusDefinitions: normalizeStatusDefinitions(sourceRoom.statusDefinitions),
      statusRules: normalizeStatusRules(sourceRoom.statusRules),
      progressViews: normalizeProgressViews(sourceRoom.progressViews),
      progressTracker: normalizeProgressTracker(sourceRoom.progressTracker),
    };
    const roomAssets = {
      lorebookEntries: Array.isArray(sourceRoom.lorebookEntries)
        ? (sourceRoom.lorebookEntries ?? [])
            .map(normalizeLorebookEntry)
            .filter((entry): entry is TavernLorebookEntry => Boolean(entry))
        : [],
      localCharacters,
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
      ...projectTavernSceneFieldsOntoRoom(activeScene),
      ...roomProgress,
      ...roomAssets,
      ...roomRuntimeSettings,
    };

    return projectTavernSceneOntoRoom(normalizedRoom);
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
