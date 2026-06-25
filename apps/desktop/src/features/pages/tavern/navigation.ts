export const TAVERN_FULLSCREEN_SEARCH_PARAM = "fullscreen";
export const TAVERN_ROOM_SEARCH_PARAM = "roomId";
export const TAVERN_SCENE_INSTANCE_SEARCH_PARAM = "sceneInstanceId";
export const TAVERN_FULLSCREEN_SEARCH = `?${TAVERN_FULLSCREEN_SEARCH_PARAM}=1`;

export const isTavernFullscreenSearch = (search: string) =>
  new URLSearchParams(search).get(TAVERN_FULLSCREEN_SEARCH_PARAM) === "1";

export const buildTavernOpenSearch = ({
  roomId,
  sceneInstanceId,
  fullscreen = true,
}: {
  roomId?: string;
  sceneInstanceId?: string;
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
  const search = params.toString();
  return search ? `?${search}` : "";
};
