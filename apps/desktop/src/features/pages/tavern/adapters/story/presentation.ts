import {
  upsertStoryAsset,
  type StoryAsset,
  type StoryPresentationSeed,
  type StoryState,
} from "@/features/story";
import {
  buildTavernOpenSearch,
} from "../../navigation";
import {
  loadTavernState,
  saveTavernState,
} from "../../storage";
import {
  switchTavernRoomStoryNode,
} from "../../active-scene-runtime";
import {
  createTavernRoomFromGeneratedPresetJson,
} from "../../generated-preset-room";
import {
  createTavernGeneratedPresetFromStoryPresentationSeed,
} from "./export-to-preset";

type OpenTavernStoryPresentationInput = {
  workspace: {
    id: string;
    path: string;
  };
  activeStory: StoryAsset;
  seed: StoryPresentationSeed;
  storyState: StoryState;
  targetNodeId: string;
  persistStoryState: (nextState: StoryState) => Promise<void>;
};

export const openTavernStoryPresentation = async ({
  workspace,
  activeStory,
  seed,
  storyState,
  targetNodeId,
  persistStoryState,
}: OpenTavernStoryPresentationInput) => {
  const tavernState = await loadTavernState(workspace.path, workspace.id);
  const preferredRoomIds = [
    ...activeStory.sourceRefs
      .filter((ref) => ref.channel === "tavern")
      .map((ref) => ref.id),
    seed.story.id,
  ];
  const existingRoom = tavernState.rooms.find((room) => preferredRoomIds.includes(room.id));
  const nextTavernState = existingRoom
    ? (() => {
        const switchedRoom = switchTavernRoomStoryNode(existingRoom, targetNodeId);
        return {
          ...tavernState,
          activeRoomId: switchedRoom.id,
          rooms: tavernState.rooms.map((room) =>
            room.id === switchedRoom.id ? switchedRoom : room
          ),
        };
      })()
    : (() => {
        const materialized = createTavernRoomFromGeneratedPresetJson(
          workspace.id,
          createTavernGeneratedPresetFromStoryPresentationSeed(seed),
          {
            storyId: seed.story.id,
            creationSource: "manual",
          },
        );
        const switchedRoom = switchTavernRoomStoryNode(materialized.room, targetNodeId);
        const sceneInstanceId = switchedRoom.activeSceneInstanceId ??
          switchedRoom.sceneInstances[0]?.id ??
          materialized.room.id;
        const messages = materialized.messages.map((message) => ({
          ...message,
          sceneId: message.sceneId ?? switchedRoom.activeSceneId,
          sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
        }));

        return {
          ...tavernState,
          activeRoomId: switchedRoom.id,
          rooms: [...tavernState.rooms, switchedRoom],
          messagesByInstance: {
            ...tavernState.messagesByInstance,
            [sceneInstanceId]: messages,
          },
        };
      })();
  const room = nextTavernState.rooms.find((item) => item.id === nextTavernState.activeRoomId);
  if (!room) {
    throw new Error("无法创建酒馆呈现。");
  }

  await saveTavernState(workspace.path, workspace.id, nextTavernState);
  const sceneInstanceId = room.activeSceneInstanceId ?? room.sceneInstances[0]?.id;
  const storyWithSourceRef: StoryAsset = {
    ...activeStory,
    sourceRefs: activeStory.sourceRefs.some((ref) =>
      ref.channel === "tavern" && ref.id === room.id
    )
      ? activeStory.sourceRefs
      : [...activeStory.sourceRefs, { channel: "tavern", id: room.id, label: room.title }],
  };
  await persistStoryState(upsertStoryAsset(storyState, storyWithSourceRef));

  return {
    pathname: "/tavern",
    search: buildTavernOpenSearch({
      roomId: room.id,
      sceneInstanceId,
      fullscreen: true,
    }),
  };
};
