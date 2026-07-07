import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { buildTavernOpenSearch } from "../../navigation";

import type { TavernPresentationInput } from "./input";
import { materializeTavernPresentationRoomState } from "./room-state";
import type { TavernState } from "../types";

type OpenTavernPresentationInputInput = {
  workspace: {
    id: string;
    path: string;
  };
  storyId?: string;
  storyNodeId?: string;
  tavernId?: string;
  runtimePath?: string;
  carrierRoom?: TavernRoom;
  presentationInput: TavernPresentationInput;
  preferredRoomIds?: string[];
  targetNodeId?: string;
};

const createEmptyTavernState = (): TavernState => ({
  version: 4,
  activeRoomId: "",
  rooms: [],
});

export const openTavernPresentationInput = async ({
  workspace,
  storyId,
  storyNodeId,
  tavernId,
  runtimePath,
  carrierRoom,
  presentationInput,
  preferredRoomIds,
  targetNodeId,
}: OpenTavernPresentationInputInput) => {
  const resolvedStoryNodeId = storyNodeId ?? targetNodeId;
  if (storyId && tavernId && !runtimePath) {
    throw new Error("故事酒馆缺少运行目录。");
  }

  const { room, sceneInstanceId, messages } = materializeTavernPresentationRoomState({
    tavernState: createEmptyTavernState(),
    workspaceId: workspace.id,
    presentationInput,
    preferredRoomIds: tavernId ? [tavernId, ...(preferredRoomIds ?? [])] : preferredRoomIds,
    targetNodeId: resolvedStoryNodeId,
    roomId: tavernId,
    carrierRoom,
  });
  if (!room) {
    throw new Error("无法创建酒馆呈现。");
  }

  return {
    room,
    sceneInstanceId,
    initialMessages: messages,
    target: {
      pathname: "/tavern",
      search: buildTavernOpenSearch({
        roomId: room.id,
        sceneInstanceId,
        storyId,
        storyNodeId: resolvedStoryNodeId,
        tavernId,
        runtimePath,
      }),
    },
  };
};
