import { toast } from "sonner";
import {
  createTavernGeneratedPresetFromStoryPresentationSeed,
} from "@/features/pages/tavern/adapters/story";
import {
  buildTavernOpenSearch,
} from "@/features/pages/tavern/navigation";
import {
  createTavernRoomFromGeneratedPresetJson,
  loadTavernState,
  saveTavernState,
  switchTavernRoomStoryNode,
} from "@/features/pages/tavern/storage";
import {
  upsertStoryAsset,
  type StoryAsset,
} from "@/features/story";
import {
  resolveStoryNodeId,
  type StoryPresentationAdapter,
} from "./shared";

export const tavernStoryPresentation = {
  definition: {
    channel: "tavern",
    label: "酒馆",
    loadingLabel: "打开中",
    icon: "tavern",
  },
  open: async ({
    workspace,
    activeStory,
    seed,
    storyState,
    persistStoryState,
    navigate,
    nodeId,
    setOpeningStoryId,
  }) => {
    const targetNodeId = resolveStoryNodeId(seed, nodeId);
    setOpeningStoryId(seed.story.id);

    try {
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
      navigate({
        pathname: "/tavern",
        search: buildTavernOpenSearch({
          roomId: room.id,
          sceneInstanceId,
          fullscreen: true,
        }),
      });
    } catch (error) {
      console.error("Failed to open story in tavern", error);
      toast.error("无法打开酒馆呈现。");
    } finally {
      setOpeningStoryId("");
    }
  },
} satisfies StoryPresentationAdapter<"tavern">;
