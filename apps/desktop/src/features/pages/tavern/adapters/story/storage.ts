import {
  submitStoryManuscript,
} from "@/features/story/persistence/story-storage";

type TavernStoryManuscriptSubmissionInput = Parameters<typeof submitStoryManuscript>[1];

export const submitTavernStoryManuscript = async ({
  storyId,
  input,
}: {
  storyId: string;
  input: TavernStoryManuscriptSubmissionInput;
}) => submitStoryManuscript(storyId, input);
