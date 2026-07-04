export const STORIES_FULLSCREEN_SEARCH_PARAM = "fullscreen";
export const STORIES_STORY_SEARCH_PARAM = "storyId";
export const STORIES_FULLSCREEN_SEARCH = `?${STORIES_FULLSCREEN_SEARCH_PARAM}=1`;

export const isStoriesFullscreenSearch = (search: string) =>
  new URLSearchParams(search).get(STORIES_FULLSCREEN_SEARCH_PARAM) === "1";

export const buildStoryOpenSearch = ({ storyId, fullscreen = true }: { storyId?: string; fullscreen?: boolean }) => {
  const params = new URLSearchParams();
  if (fullscreen) {
    params.set(STORIES_FULLSCREEN_SEARCH_PARAM, "1");
  }
  if (storyId) {
    params.set(STORIES_STORY_SEARCH_PARAM, storyId);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
};
