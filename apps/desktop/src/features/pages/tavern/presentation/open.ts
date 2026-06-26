import {
  buildTavernOpenSearch,
} from "../navigation";
import {
  loadTavernState,
  saveTavernState,
} from "../state/storage";
import type {
  TavernPresentationInput,
} from "./input";
import {
  materializeTavernPresentationRoomState,
} from "./room-state";

type OpenTavernPresentationInputInput = {
  workspace: {
    id: string;
    path: string;
  };
  presentationInput: TavernPresentationInput;
  preferredRoomIds?: string[];
  targetNodeId?: string;
};

export const openTavernPresentationInput = async ({
  workspace,
  presentationInput,
  preferredRoomIds,
  targetNodeId,
}: OpenTavernPresentationInputInput) => {
  const tavernState = await loadTavernState(workspace.path, workspace.id);
  const {
    tavernState: nextTavernState,
    room,
    sceneInstanceId,
  } = materializeTavernPresentationRoomState({
    tavernState,
    workspaceId: workspace.id,
    presentationInput,
    preferredRoomIds,
    targetNodeId,
  });
  if (!room) {
    throw new Error("无法创建酒馆呈现。");
  }

  await saveTavernState(workspace.path, workspace.id, nextTavernState);

  return {
    room,
    sceneInstanceId,
    target: {
      pathname: "/tavern",
      search: buildTavernOpenSearch({
        roomId: room.id,
        sceneInstanceId,
        fullscreen: true,
      }),
    },
  };
};
