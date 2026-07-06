import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { buildTavernOpenSearch } from "../../navigation";
import { clearTavernState, loadTavernState, saveTavernState } from "../../storage";

import type { TavernPresentationInput } from "./input";
import { materializeTavernPresentationRoomState } from "./room-state";

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
  rebuild?: boolean;
};

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
  rebuild = false,
}: OpenTavernPresentationInputInput) => {
  const resolvedStoryNodeId = storyNodeId ?? targetNodeId;
  const scope = {
    storyId,
    storyNodeId: resolvedStoryNodeId,
    tavernId,
    runtimePath,
  };
  if (storyId && tavernId && !runtimePath) {
    throw new Error("故事酒馆缺少运行目录。");
  }
  if (rebuild) {
    await clearTavernState(workspace.path, workspace.id, scope);
  }

  const tavernState = await loadTavernState(workspace.path, workspace.id, scope);
  const {
    tavernState: nextTavernState,
    room,
    sceneInstanceId,
    runtimeState,
  } = materializeTavernPresentationRoomState({
    tavernState,
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

  await saveTavernState(workspace.path, workspace.id, nextTavernState, scope);

  return {
    room,
    sceneInstanceId,
    runtimeState,
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
