import { uniq } from "lodash-es";
import { createTavernId as createId, now } from "../../tavern/ids";
import { materializeTavernMessage } from "@/features/pages/taverns/room/message/domain/factory";
import { normalizeReplyMode } from "../../tavern/normalizers/reply-mode";
import { normalizeCharacterRelationships } from "../../tavern/normalizers/relationships";
import { normalizeRoomCharacterConfigs } from "../../tavern/normalizers/room-character-configs";
import { normalizeRoomSettings } from "../../tavern/normalizers/room-settings";
import { normalizeRoomPresentation } from "../../tavern/presentation/presentation-settings";
import { createDefaultPromptForPresentation } from "../../tavern/presentation/presentation-settings";
import {
  createDefaultTavernPromptSettings,
  normalizeTavernPromptSettings,
} from "../../tavern/prompt-registry/text-blocks";
import { projectTavernSceneOntoRoom } from "../../tavern/runtime/active-scene-runtime";
import { projectTavernSceneFieldsOntoRoom } from "../../tavern/runtime/scene-field-projection";
import { buildTavernScene, defaultSceneTitle } from "@/features/pages/taverns/room/story-model/scene-builder";
import { createTavernStoryBinding } from "@/features/pages/taverns/room/story-model/story-binding";
import { normalizeStoryGraph } from "@/features/pages/taverns/room/story-model/story-graph";
import type { TavernMessage } from "../../tavern/types";
import type { TavernCharacter, TavernLorebookEntry } from "@/features/pages/taverns/manage/model";
import type { TavernActiveRoomView as TavernRoom } from "@/features/pages/taverns/room/model";
import type {
  TavernPresentationCharacterInput,
  TavernPresentationInput,
  TavernPresentationLorebookEntryInput,
  TavernPresentationOpeningMessageInput,
  TavernPresentationSceneInput,
} from "./types";

const trimText = (value: string | undefined | null) => value?.trim() ?? "";

const unique = (items: string[]) => uniq(items.filter(Boolean));

const createTavernInputCharacter = (input: TavernPresentationCharacterInput, createdAt: number): TavernCharacter => ({
  id: trimText(input.id) || createId("character"),
  name: trimText(input.name) || "未命名角色",
  avatar: trimText(input.avatar),
  description: trimText(input.description),
  speakingStyle: trimText(input.speakingStyle),
  writingStyle: trimText(input.writingStyle) || undefined,
  replyStylePrompt: trimText(input.replyStylePrompt) || undefined,
  goals: trimText(input.goals) || undefined,
  relationships: normalizeCharacterRelationships(input.relationships, createdAt),
  createdAt,
  updatedAt: createdAt,
});

const createTavernInputLorebookEntry = (
  input: TavernPresentationLorebookEntryInput,
  createdAt: number,
): TavernLorebookEntry | null => {
  const title = trimText(input.title);
  const content = trimText(input.content);
  if (!title || !content) {
    return null;
  }

  return {
    id: trimText(input.id) || createId("lore"),
    title,
    content,
    keywords: unique(input.keywords.map(trimText)),
    enabled: input.enabled !== false,
    alwaysOn: Boolean(input.alwaysOn),
    createdAt: typeof input.createdAt === "number" ? input.createdAt : createdAt,
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : createdAt,
  };
};

const createSceneCharacterMemories = ({
  scene,
  characterMemoryDefaults,
}: {
  scene: TavernPresentationSceneInput;
  characterMemoryDefaults: Record<string, string>;
}) => ({
  ...characterMemoryDefaults,
  ...(scene.characterMemories ?? {}),
});

const resolveRoomCharacterIds = ({
  requestedCharacterIds,
  characters,
}: {
  requestedCharacterIds?: string[];
  characters: TavernCharacter[];
}) => {
  const characterIds = new Set(characters.map((character) => character.id));
  const requested = requestedCharacterIds?.filter((characterId) => characterIds.has(characterId)) ?? [];
  return requested.length > 0 ? unique(requested) : characters.map((character) => character.id);
};

const createTavernInputScene = ({
  scene,
  index,
  roomCharacterIds,
  roomActiveCharacterId,
  characterMemoryDefaults,
  createdAt,
}: {
  scene: TavernPresentationSceneInput;
  index: number;
  roomCharacterIds: string[];
  roomActiveCharacterId: string;
  characterMemoryDefaults: Record<string, string>;
  createdAt: number;
}) => {
  const sceneCharacterIds = scene.characterIds?.length
    ? scene.characterIds.filter((characterId) => roomCharacterIds.includes(characterId))
    : roomCharacterIds;
  const activeCharacterId =
    scene.activeCharacterId && sceneCharacterIds.includes(scene.activeCharacterId)
      ? scene.activeCharacterId
      : sceneCharacterIds.includes(roomActiveCharacterId)
        ? roomActiveCharacterId
        : (sceneCharacterIds[0] ?? "");

  return buildTavernScene({
    id: trimText(scene.id) || undefined,
    title: trimText(scene.title) || defaultSceneTitle,
    order: typeof scene.order === "number" ? scene.order : index,
    scenePresetId: scene.scenePresetId,
    scene: trimText(scene.scene) || "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    sceneGoal: trimText(scene.sceneGoal),
    plot: trimText(scene.plot),
    storyDirection: trimText(scene.storyDirection),
    transition: trimText(scene.transition),
    memory: trimText(scene.memory),
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    pendingInteractions: [],
    replyOptions: [],
    characterConfigs: normalizeRoomCharacterConfigs(
      undefined,
      createSceneCharacterMemories({ scene, characterMemoryDefaults }),
    ),
    characterMemories: createSceneCharacterMemories({ scene, characterMemoryDefaults }),
    characterIds: sceneCharacterIds,
    activeCharacterId,
    createdAt,
    updatedAt: createdAt,
  });
};

const createOpeningMessage = ({
  input,
  room,
  createdAt,
}: {
  input: TavernPresentationOpeningMessageInput;
  room: TavernRoom;
  createdAt: number;
}): TavernMessage | null => {
  const content = trimText(input.content);
  if (!content) {
    return null;
  }

  if (input.role === "character") {
    const characterId = trimText(input.characterId);
    if (!characterId || !room.characterIds.includes(characterId)) {
      return null;
    }

    return materializeTavernMessage(
      {
        id: createId("message"),
        roomId: room.id,
        sceneId: room.activeSceneId,
        sceneInstanceId: room.activeSceneInstanceId,
        role: "character",
        characterId,
        content,
        createdAt,
        status: "done",
      },
      room.presentation.profileId,
    );
  }

  return materializeTavernMessage(
    {
      id: createId("message"),
      roomId: room.id,
      sceneId: room.activeSceneId,
      sceneInstanceId: room.activeSceneInstanceId,
      role: input.role === "user" ? "user" : "narrator",
      content,
      createdAt,
      status: "done",
    },
    room.presentation.profileId,
  );
};

export const materializeTavernPresentationInput = (
  workspaceId: string,
  input: TavernPresentationInput,
  options: {
    roomId?: string;
    roomCreatedAt?: number;
    createdAt?: number;
  } = {},
) => {
  const createdAt = options.createdAt ?? now();
  const roomId = options.roomId ?? createId("room");
  const characters = input.cast.characters.map((character) => createTavernInputCharacter(character, createdAt));
  const roomCharacterIds = resolveRoomCharacterIds({
    requestedCharacterIds: input.cast.characterIds,
    characters,
  });
  const roomActiveCharacterId =
    input.cast.activeCharacterId && roomCharacterIds.includes(input.cast.activeCharacterId)
      ? input.cast.activeCharacterId
      : (roomCharacterIds[0] ?? "");
  const characterMemoryDefaults = Object.fromEntries(
    input.cast.characters.flatMap((character) => {
      const characterId = trimText(character.id);
      const memory = trimText(character.memory);
      return characterId && memory ? [[characterId, memory]] : [];
    }),
  );
  const characterConfigs = normalizeRoomCharacterConfigs(undefined, characterMemoryDefaults);
  const lorebookEntries = input.world.lorebookEntries
    .map((entry) => createTavernInputLorebookEntry(entry, createdAt))
    .filter((entry): entry is TavernLorebookEntry => Boolean(entry));
  const scenes = input.scenes.items
    .map((scene, index) =>
      createTavernInputScene({
        scene,
        index,
        roomCharacterIds,
        roomActiveCharacterId,
        characterMemoryDefaults,
        createdAt,
      }),
    )
    .sort((left, right) => left.order - right.order)
    .map((scene, index) => ({ ...scene, order: index }));
  const fallbackScene = buildTavernScene({
    title: defaultSceneTitle,
    characterConfigs,
    characterMemories: characterMemoryDefaults,
    characterIds: roomCharacterIds,
    activeCharacterId: roomActiveCharacterId,
    createdAt,
    updatedAt: createdAt,
  });
  const activeScene = scenes.find((scene) => scene.id === input.scenes.activeSceneId) ?? scenes[0] ?? fallbackScene;
  const normalizedScenes = scenes.length > 0 ? scenes : [activeScene];
  const storyGraph = normalizeStoryGraph(
    {
      ...input.route.graph,
      activeNodeId: input.route.activeNodeId || input.route.graph.activeNodeId,
    },
    normalizedScenes,
  );
  const presentation = normalizeRoomPresentation({
    presentation: input.runtime?.presentation,
  });
  const prompt = normalizeTavernPromptSettings(
    input.runtime?.prompt,
    input.runtime?.prompt
      ? createDefaultPromptForPresentation(presentation)
      : createDefaultTavernPromptSettings({
          presentationProfileId: presentation.profileId,
          immersiveDescriptionEnabled: true,
        }),
  );
  const roomStory = {
    storyBinding: createTavernStoryBinding(input.source.id ?? roomId, createdAt),
    storyOutline: trimText(input.world.outline),
    storyGoal: trimText(input.world.goal),
    storyGraph,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    activeSceneId: activeScene.id,
    scenes: normalizedScenes,
  };
  const room = projectTavernSceneOntoRoom({
    id: roomId,
    workspaceId,
    title: trimText(input.meta.title) || "故事演绎",
    creationSource: input.runtime?.creationSource ?? "manual",
    presentation,
    prompt,
    ...roomStory,
    ...projectTavernSceneFieldsOntoRoom(activeScene),
    characterConfigs,
    characterMemories: characterMemoryDefaults,
    localCharacters: characters,
    lorebookEntries,
    characterIds: roomCharacterIds,
    activeCharacterId: roomActiveCharacterId,
    replyMode: normalizeReplyMode(input.runtime?.replyMode),
    userPersonaName: trimText(input.meta.userPersonaName) || "我",
    settings: normalizeRoomSettings(input.runtime?.settings, {
      characters,
      characterIds: roomCharacterIds,
      profileSource: "manual",
      updatedAt: createdAt,
    }),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  });
  const messages = (input.opening?.messages ?? [])
    .map((message) => createOpeningMessage({ input: message, room, createdAt }))
    .filter((message): message is TavernMessage => Boolean(message));

  return {
    room,
    characters,
    messages:
      messages.length > 0
        ? messages
        : [
            {
              id: createId("message"),
              roomId,
              sceneId: room.activeSceneId,
              sceneInstanceId: room.activeSceneInstanceId,
              role: "narrator" as const,
              presentationProfileId: room.presentation.profileId,
              content: "故事演绎已经准备好。",
              createdAt,
              status: "done" as const,
            },
          ].map((message) => materializeTavernMessage(message, room.presentation.profileId)),
  };
};
