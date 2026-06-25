import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  createTavernGeneratedPresetFromStoryAsset,
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
  type StoryState,
} from "@/features/story";
import type { Workspace } from "@/features/pages/workspace/types";

type StoryPresentationActionsInput = {
  workspace: Workspace | null;
  activeStory: StoryAsset | null;
  storyState: StoryState;
  persistStoryState: (nextState: StoryState) => Promise<void>;
};

const resolveStoryNodeId = (
  story: StoryAsset | null,
  nodeId?: string | null,
) => nodeId ||
  story?.graph.activeNodeId ||
  story?.graph.entryNodeId ||
  story?.graph.nodes[0]?.id ||
  "";

export const useStoryPresentationActions = ({
  workspace,
  activeStory,
  storyState,
  persistStoryState,
}: StoryPresentationActionsInput) => {
  const navigate = useNavigate();
  const [openingStoryId, setOpeningStoryId] = useState("");

  const openStoryInTavern = async (nodeId?: string | null) => {
    if (!workspace || !activeStory) {
      return;
    }

    const targetNodeId = resolveStoryNodeId(activeStory, nodeId);
    setOpeningStoryId(activeStory.id);
    try {
      const tavernState = await loadTavernState(workspace.path, workspace.id);
      const preferredRoomIds = [
        ...activeStory.sourceRefs
          .filter((ref) => ref.channel === "tavern")
          .map((ref) => ref.id),
        activeStory.id,
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
              createTavernGeneratedPresetFromStoryAsset(activeStory),
              {
                storyId: activeStory.id,
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
  };

  const openStoryNodeInChat = (nodeId?: string | null) => {
    if (!workspace || !activeStory) {
      return;
    }

    const targetNodeId = resolveStoryNodeId(activeStory, nodeId);
    const search = [
      `storyId=${encodeURIComponent(activeStory.id)}`,
      targetNodeId ? `storyNodeId=${encodeURIComponent(targetNodeId)}` : "",
    ].filter(Boolean).join("&");
    navigate({
      pathname: `/chat/${workspace.id}/new`,
      search: search ? `?${search}` : "",
    });
  };

  return {
    openingStoryId,
    openStoryInTavern,
    openStoryNodeInChat,
  };
};
