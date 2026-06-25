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
} from "../../state/storage";
import {
  materializeTavernStoryPresentationRoomState,
  upsertTavernStoryPresentationSourceRef,
} from "./presentation-room";

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
  const {
    tavernState: nextTavernState,
    room,
    sceneInstanceId,
  } = materializeTavernStoryPresentationRoomState({
    tavernState,
    workspaceId: workspace.id,
    activeStory,
    seed,
    targetNodeId,
  });
  if (!room) {
    throw new Error("无法创建酒馆呈现。");
  }

  await saveTavernState(workspace.path, workspace.id, nextTavernState);
  await persistStoryState(upsertStoryAsset(
    storyState,
    upsertTavernStoryPresentationSourceRef(activeStory, room),
  ));

  return {
    pathname: "/tavern",
    search: buildTavernOpenSearch({
      roomId: room.id,
      sceneInstanceId,
      fullscreen: true,
    }),
  };
};
