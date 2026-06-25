import type {
  StoryManuscriptSubmissionInput,
  StoryState,
} from "@/features/story";
import {
  loadStoryState,
  submitStoryManuscript,
} from "@/features/story/storage";

type TavernStoryWorkspaceInput = {
  workspacePath: string;
  workspaceId: string;
};

export const loadTavernStoryState = async ({
  workspacePath,
  workspaceId,
}: TavernStoryWorkspaceInput): Promise<StoryState> =>
  loadStoryState(workspacePath, workspaceId);

export const submitTavernStoryManuscript = async ({
  workspacePath,
  workspaceId,
  input,
}: TavernStoryWorkspaceInput & {
  input: StoryManuscriptSubmissionInput;
}) => submitStoryManuscript(workspacePath, workspaceId, input);
