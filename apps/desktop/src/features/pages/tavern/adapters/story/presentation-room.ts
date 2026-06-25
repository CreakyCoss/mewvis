import type {
  StoryAsset,
  StoryPresentationSeed,
} from "@/features/story";
import {
  createTavernRoomFromGeneratedPresetJson,
} from "../../factories/generated-preset-room";
import {
  switchTavernRoomStoryNode,
} from "../../runtime/active-scene-runtime";
import type {
  TavernRoom,
  TavernState,
} from "../../types";
import {
  createTavernGeneratedPresetFromStoryPresentationSeed,
} from "./export-to-preset";

const resolvePreferredTavernRoomIds = (
  activeStory: StoryAsset,
  seed: StoryPresentationSeed,
) => [
  ...activeStory.sourceRefs
    .filter((ref) => ref.channel === "tavern")
    .map((ref) => ref.id),
  seed.story.id,
];

const resolveRoomSceneInstanceId = (
  room: TavernRoom,
  fallbackId?: string,
) => room.activeSceneInstanceId ?? room.sceneInstances[0]?.id ?? fallbackId;

export const materializeTavernStoryPresentationRoomState = ({
  tavernState,
  workspaceId,
  activeStory,
  seed,
  targetNodeId,
}: {
  tavernState: TavernState;
  workspaceId: string;
  activeStory: StoryAsset;
  seed: StoryPresentationSeed;
  targetNodeId: string;
}) => {
  const preferredRoomIds = resolvePreferredTavernRoomIds(activeStory, seed);
  const existingRoom = tavernState.rooms.find((room) => preferredRoomIds.includes(room.id));

  if (existingRoom) {
    const switchedRoom = switchTavernRoomStoryNode(existingRoom, targetNodeId);
    return {
      tavernState: {
        ...tavernState,
        activeRoomId: switchedRoom.id,
        rooms: tavernState.rooms.map((room) =>
          room.id === switchedRoom.id ? switchedRoom : room
        ),
      },
      room: switchedRoom,
      sceneInstanceId: resolveRoomSceneInstanceId(switchedRoom),
    };
  }

  const materialized = createTavernRoomFromGeneratedPresetJson(
    workspaceId,
    createTavernGeneratedPresetFromStoryPresentationSeed(seed),
    {
      storyId: seed.story.id,
      creationSource: "manual",
    },
  );
  const switchedRoom = switchTavernRoomStoryNode(materialized.room, targetNodeId);
  const sceneInstanceId = resolveRoomSceneInstanceId(switchedRoom, materialized.room.id);
  const messages = materialized.messages.map((message) => ({
    ...message,
    sceneId: message.sceneId ?? switchedRoom.activeSceneId,
    sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
  }));

  return {
    tavernState: {
      ...tavernState,
      activeRoomId: switchedRoom.id,
      rooms: [...tavernState.rooms, switchedRoom],
      messagesByInstance: {
        ...tavernState.messagesByInstance,
        [sceneInstanceId]: messages,
      },
    },
    room: switchedRoom,
    sceneInstanceId,
  };
};

export const upsertTavernStoryPresentationSourceRef = (
  activeStory: StoryAsset,
  room: TavernRoom,
): StoryAsset => ({
  ...activeStory,
  sourceRefs: activeStory.sourceRefs.some((ref) =>
    ref.channel === "tavern" && ref.id === room.id
  )
    ? activeStory.sourceRefs
    : [...activeStory.sourceRefs, { channel: "tavern", id: room.id, label: room.title }],
});
