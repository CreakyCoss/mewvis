import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  createEmptyStoryState,
  normalizeStoryState,
  submitStoryManuscriptToState,
  type StoryState,
} from "./application/state";
import type { StoryManuscriptSubmissionInput } from "./application/manuscript-inbox";

const STORY_STORAGE_PREFIX = "novel-claw:story";

const storyStorageKeyForWorkspace = (workspaceId: string) =>
  `${STORY_STORAGE_PREFIX}:${workspaceId}`;

const loadStoryStateFromLocalStorage = (workspaceId: string): StoryState => {
  if (typeof window === "undefined") {
    return createEmptyStoryState();
  }

  try {
    const raw = window.localStorage.getItem(storyStorageKeyForWorkspace(workspaceId));
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeStoryState(workspaceId, parsed) ?? createEmptyStoryState();
  } catch {
    return createEmptyStoryState();
  }
};

const saveStoryStateToLocalStorage = (
  workspaceId: string,
  state: StoryState,
) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedState = normalizeStoryState(workspaceId, state) ?? createEmptyStoryState();
  window.localStorage.setItem(
    storyStorageKeyForWorkspace(workspaceId),
    JSON.stringify(normalizedState),
  );
};

const deleteStoryStateFromLocalStorage = (workspaceId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storyStorageKeyForWorkspace(workspaceId));
};

export const loadStoryState = async (
  workspacePath: string,
  workspaceId: string,
): Promise<StoryState> => {
  if (!isTauri()) {
    return loadStoryStateFromLocalStorage(workspaceId);
  }

  deleteStoryStateFromLocalStorage(workspaceId);
  const storedState = await invoke<unknown | null>("load_story_state", {
    input: { workspacePath },
  });

  return normalizeStoryState(workspaceId, storedState) ?? createEmptyStoryState();
};

export const saveStoryState = async (
  workspacePath: string,
  workspaceId: string,
  state: StoryState,
) => {
  const normalizedState = normalizeStoryState(workspaceId, state) ?? createEmptyStoryState();
  if (!isTauri()) {
    saveStoryStateToLocalStorage(workspaceId, normalizedState);
    return normalizedState;
  }

  deleteStoryStateFromLocalStorage(workspaceId);
  await invoke("save_story_state", {
    input: { workspacePath, state: normalizedState },
  });
  return normalizedState;
};

export const submitStoryManuscript = async (
  workspacePath: string,
  workspaceId: string,
  input: StoryManuscriptSubmissionInput,
) => {
  const currentState = await loadStoryState(workspacePath, workspaceId);
  const submission = submitStoryManuscriptToState(currentState, input);
  const savedState = await saveStoryState(workspacePath, workspaceId, submission.state);
  const story = savedState.stories.find((item) => item.id === input.storyId);
  if (!story) {
    throw new Error("稿件已提交，但无法读取保存后的故事。");
  }

  return {
    draft: submission.draft,
    story,
    state: savedState,
  };
};
