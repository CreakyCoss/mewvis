import {
  acceptStoryManuscript,
  createStoryManuscript,
  rejectStoryManuscript,
  sortNewestFirst,
  updateStoryManuscript,
} from "./domain";
import { loadStoryManuscripts, persistStoryManuscripts } from "./repository";
import type { StoryJson } from "../../story/model/types";
import { loadStoryById, type StoryWorkspace } from "../../storage";
import type { StoryManuscript, StoryManuscriptSubmissionInput, StoryManuscriptUpdateInput } from "../model/types";

export type { StoryManuscript, StoryManuscriptSubmissionInput, StoryManuscriptUpdateInput } from "../model/types";

export const listStoryManuscripts = async (workspace: StoryWorkspace, storyId: string) =>
  (await loadStoryManuscripts(workspace.path, storyId)).sort(sortNewestFirst);

export const submitStoryManuscriptToWorkspace = async (
  story: StoryJson,
  workspace: StoryWorkspace,
  input: StoryManuscriptSubmissionInput,
) => {
  const manuscripts = await loadStoryManuscripts(workspace.path, story.id);
  const manuscript = createStoryManuscript(story, input);
  await persistStoryManuscripts(workspace.path, story.id, [manuscript, ...manuscripts]);
  return {
    manuscript,
    story,
  };
};

export const submitStoryManuscript = async (storyId: string, input: StoryManuscriptSubmissionInput) => {
  const loaded = await loadStoryById(storyId);
  if (!loaded) {
    throw new Error("找不到要收稿的故事。");
  }

  return submitStoryManuscriptToWorkspace(loaded.story, loaded.workspace, input);
};

export const updateStoryManuscriptDraft = async ({
  draftId,
  input,
  storyId,
  workspace,
}: {
  draftId: string;
  input: StoryManuscriptUpdateInput;
  storyId: string;
  workspace: StoryWorkspace;
}) => {
  const manuscripts = await loadStoryManuscripts(workspace.path, storyId);
  const draft = findManuscript(manuscripts, draftId);
  const nextDraft = updateStoryManuscript(draft, input);
  const nextManuscripts = manuscripts.map((item) => (item.id === draftId ? nextDraft : item));
  await persistStoryManuscripts(workspace.path, storyId, nextManuscripts);
  return nextDraft;
};

export const acceptStoryManuscriptDraft = async ({
  draftId,
  patch,
  storyId,
  workspace,
}: {
  draftId: string;
  patch?: StoryManuscriptUpdateInput;
  storyId: string;
  workspace: StoryWorkspace;
}) => {
  const manuscripts = await loadStoryManuscripts(workspace.path, storyId);
  const draft = findManuscript(manuscripts, draftId);
  const patchedDraft = patch ? updateStoryManuscript(draft, patch) : draft;
  const accepted = acceptStoryManuscript(patchedDraft);
  const nextManuscripts = manuscripts.map((item) => (item.id === draftId ? accepted : item));
  await persistStoryManuscripts(workspace.path, storyId, nextManuscripts);
  return accepted;
};

export const rejectStoryManuscriptDraft = async ({
  draftId,
  storyId,
  workspace,
}: {
  draftId: string;
  storyId: string;
  workspace: StoryWorkspace;
}) => {
  const manuscripts = await loadStoryManuscripts(workspace.path, storyId);
  const draft = findManuscript(manuscripts, draftId);
  const rejected = rejectStoryManuscript(draft);
  const nextManuscripts = manuscripts.map((item) => (item.id === draftId ? rejected : item));
  await persistStoryManuscripts(workspace.path, storyId, nextManuscripts);
  return rejected;
};

export const loadAcceptedStoryManuscriptsForNode = async ({
  nodeId,
  storyId,
  workspace,
}: {
  nodeId: string;
  storyId: string;
  workspace: StoryWorkspace;
}) =>
  (await loadStoryManuscripts(workspace.path, storyId))
    .filter((manuscript) => manuscript.status === "accepted" && manuscript.nodeId === nodeId)
    .sort(sortNewestFirst);

const findManuscript = (manuscripts: StoryManuscript[], manuscriptId: string) => {
  const manuscript = manuscripts.find((item) => item.id === manuscriptId);
  if (!manuscript) {
    throw new Error("找不到要处理的稿件。");
  }
  return manuscript;
};
