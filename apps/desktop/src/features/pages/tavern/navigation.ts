import { buildSearch, FULLSCREEN_SEARCH, FULLSCREEN_SEARCH_PARAM, isFullscreenSearch } from "@/utils/navigation";

export const TAVERN_FULLSCREEN_SEARCH_PARAM = FULLSCREEN_SEARCH_PARAM;
export const TAVERN_ROOM_SEARCH_PARAM = "roomId";
export const TAVERN_SCENE_INSTANCE_SEARCH_PARAM = "sceneInstanceId";
export const TAVERN_STORY_SEARCH_PARAM = "storyId";
export const TAVERN_STORY_NODE_SEARCH_PARAM = "storyNodeId";
export const TAVERN_ID_SEARCH_PARAM = "tavernId";
export const TAVERN_RUNTIME_PATH_SEARCH_PARAM = "tavernRuntimePath";
export const TAVERN_FULLSCREEN_SEARCH = FULLSCREEN_SEARCH;

export const isTavernFullscreenSearch = isFullscreenSearch;

export const buildTavernOpenSearch = ({
  roomId,
  sceneInstanceId,
  storyId,
  storyNodeId,
  tavernId,
  runtimePath,
  fullscreen = true,
}: {
  roomId?: string;
  sceneInstanceId?: string;
  storyId?: string;
  storyNodeId?: string;
  tavernId?: string;
  runtimePath?: string;
  fullscreen?: boolean;
}) => {
  return buildSearch({
    [TAVERN_FULLSCREEN_SEARCH_PARAM]: fullscreen,
    [TAVERN_ROOM_SEARCH_PARAM]: roomId,
    [TAVERN_SCENE_INSTANCE_SEARCH_PARAM]: sceneInstanceId,
    [TAVERN_STORY_SEARCH_PARAM]: storyId,
    [TAVERN_STORY_NODE_SEARCH_PARAM]: storyNodeId,
    [TAVERN_ID_SEARCH_PARAM]: tavernId,
    [TAVERN_RUNTIME_PATH_SEARCH_PARAM]: runtimePath,
  });
};
