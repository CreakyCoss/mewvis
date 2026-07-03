export const TAVERN_FULLSCREEN_SEARCH_PARAM = "fullscreen";
export const TAVERN_ROOM_SEARCH_PARAM = "roomId";
export const TAVERN_SCENE_INSTANCE_SEARCH_PARAM = "sceneInstanceId";
export const TAVERN_STORY_SEARCH_PARAM = "storyId";
export const TAVERN_STORY_NODE_SEARCH_PARAM = "storyNodeId";
export const TAVERN_ID_SEARCH_PARAM = "tavernId";
export const TAVERN_RUNTIME_PATH_SEARCH_PARAM = "tavernRuntimePath";
export const TAVERN_FULLSCREEN_SEARCH = `?${TAVERN_FULLSCREEN_SEARCH_PARAM}=1`;

export const isTavernFullscreenSearch = (search: string) =>
  new URLSearchParams(search).get(TAVERN_FULLSCREEN_SEARCH_PARAM) === "1";

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
  const params = new URLSearchParams();
  if (fullscreen) {
    params.set(TAVERN_FULLSCREEN_SEARCH_PARAM, "1");
  }
  if (roomId) {
    params.set(TAVERN_ROOM_SEARCH_PARAM, roomId);
  }
  if (sceneInstanceId) {
    params.set(TAVERN_SCENE_INSTANCE_SEARCH_PARAM, sceneInstanceId);
  }
  if (storyId) {
    params.set(TAVERN_STORY_SEARCH_PARAM, storyId);
  }
  if (storyNodeId) {
    params.set(TAVERN_STORY_NODE_SEARCH_PARAM, storyNodeId);
  }
  if (tavernId) {
    params.set(TAVERN_ID_SEARCH_PARAM, tavernId);
  }
  if (runtimePath) {
    params.set(TAVERN_RUNTIME_PATH_SEARCH_PARAM, runtimePath);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
};
