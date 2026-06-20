export const TAVERN_FULLSCREEN_SEARCH_PARAM = "fullscreen";
export const TAVERN_FULLSCREEN_SEARCH = `?${TAVERN_FULLSCREEN_SEARCH_PARAM}=1`;

export const isTavernFullscreenSearch = (search: string) =>
  new URLSearchParams(search).get(TAVERN_FULLSCREEN_SEARCH_PARAM) === "1";
