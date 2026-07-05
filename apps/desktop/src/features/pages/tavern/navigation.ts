export const TAVERN_ROOM_SEARCH_PARAM = "roomId";
export const TAVERN_SCENE_INSTANCE_SEARCH_PARAM = "sceneInstanceId";
export const TAVERN_STORY_SEARCH_PARAM = "storyId";
export const TAVERN_STORY_NODE_SEARCH_PARAM = "storyNodeId";
export const TAVERN_ID_SEARCH_PARAM = "tavernId";
export const TAVERN_RUNTIME_PATH_SEARCH_PARAM = "tavernRuntimePath";

type SearchParamValue = string | number | null | undefined;

const buildTavernSearch = (entries: Record<string, SearchParamValue>) => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `?${search}` : "";
};

export const buildTavernOpenSearch = ({
  roomId,
  sceneInstanceId,
  storyId,
  storyNodeId,
  tavernId,
  runtimePath,
}: {
  roomId?: string;
  sceneInstanceId?: string;
  storyId?: string;
  storyNodeId?: string;
  tavernId?: string;
  runtimePath?: string;
}) => {
  return buildTavernSearch({
    [TAVERN_ROOM_SEARCH_PARAM]: roomId,
    [TAVERN_SCENE_INSTANCE_SEARCH_PARAM]: sceneInstanceId,
    [TAVERN_STORY_SEARCH_PARAM]: storyId,
    [TAVERN_STORY_NODE_SEARCH_PARAM]: storyNodeId,
    [TAVERN_ID_SEARCH_PARAM]: tavernId,
    [TAVERN_RUNTIME_PATH_SEARCH_PARAM]: runtimePath,
  });
};
