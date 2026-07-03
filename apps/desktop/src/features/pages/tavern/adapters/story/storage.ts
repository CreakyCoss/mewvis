import type {
  StoryManuscriptSubmissionInput,
  StoryState,
} from "@/features/story";
import {
  loadStoryById,
  submitStoryManuscript,
} from "@/features/story/storage";

export const loadTavernStoryState = async (
  storyId: string | undefined,
): Promise<StoryState | null> => {
  if (!storyId) {
    return null;
  }

  const loaded = await loadStoryById(storyId);
  if (!loaded) {
    return null;
  }

  return {
    version: 1,
    activeStoryId: loaded.story.id,
    stories: [loaded.story],
  };
};

export const submitTavernStoryManuscript = async ({
  storyId,
  input,
}: {
  storyId: string;
  input: StoryManuscriptSubmissionInput;
}) => submitStoryManuscript(storyId, input);
