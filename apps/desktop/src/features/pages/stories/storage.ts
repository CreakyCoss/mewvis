import { invoke, isTauri } from "@tauri-apps/api/core";
import { createDefaultStoryJson } from "./story/model/state";
import type { StoryJson } from "./story/model/types";
import { normalizeStoryJson } from "./story/model/normalizer";
import { readJsonWorkspaceFile, writeJsonWorkspaceFile } from "@/utils/files";

const STORY_SOURCE_DIR = "story";
const STORY_MANIFEST_FILE = `${STORY_SOURCE_DIR}/manifest.json`;
const STORY_JSON_FILE = `${STORY_SOURCE_DIR}/story.json`;

export type StoryRecord = {
  id: string;
  name: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
};

export type StoryWorkspace = {
  id: string;
  name: string;
  path: string;
};

export type StoryLibraryItem = {
  id: string;
  story: StoryJson;
  workspace: StoryWorkspace;
};

export type CreateStoryInput = {
  name: string;
  workspaceParentPath: string;
};

type StoryManifest = {
  id: string;
  name: string;
  updatedAt: number;
};

const storyWorkspaceFromRecord = (record: StoryRecord): StoryWorkspace => ({
  id: record.id,
  name: record.name,
  path: record.workspacePath,
});

const storyLibraryItemFromRecord = async (record: StoryRecord): Promise<StoryLibraryItem> => ({
  id: record.id,
  story: await loadStoryJson(record),
  workspace: storyWorkspaceFromRecord(record),
});

const normalizeStoryRecord = (value: unknown): StoryRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoryRecord>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const workspacePath = typeof candidate.workspacePath === "string" ? candidate.workspacePath.trim() : "";
  if (!id || !name || !workspacePath) {
    return null;
  }

  return {
    id,
    name,
    workspacePath,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
  };
};

const normalizeStoryJsonForRecord = (record: StoryRecord, value: unknown): StoryJson | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = {
    ...(value as Record<string, unknown>),
    id: record.id,
    title: typeof (value as { title?: unknown }).title === "string" ? (value as { title: string }).title : record.name,
  };
  return normalizeStoryJson(candidate, {
    id: record.id,
    title: record.name,
  });
};

const createStoryManifest = (story: StoryJson): StoryManifest => ({
  id: story.id,
  name: story.title,
  updatedAt: story.updatedAt,
});

const createDesktopOnlyStoryStorageError = () => new Error("故事文件存储仅支持桌面环境。");

export const listStoryRecords = async (): Promise<StoryRecord[]> => {
  if (!isTauri()) {
    return [];
  }

  const records = await invoke<unknown[]>("list_story_records");
  return records.flatMap((record) => {
    const normalized = normalizeStoryRecord(record);
    return normalized ? [normalized] : [];
  });
};

export const createStoryRecord = async (input: CreateStoryInput): Promise<StoryRecord> => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }

  const record = await invoke<unknown>("create_story_record", {
    input: {
      name: input.name,
      workspacePath: input.workspaceParentPath,
    },
  });
  const normalized = normalizeStoryRecord(record);
  if (!normalized) {
    throw new Error("故事记录创建后无法读取。");
  }
  return normalized;
};

export const updateStoryRecordName = async (storyId: string, name: string): Promise<StoryRecord> => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }

  const record = await invoke<unknown>("update_story_record", {
    input: { id: storyId, name },
  });
  const normalized = normalizeStoryRecord(record);
  if (!normalized) {
    throw new Error("故事记录更新后无法读取。");
  }
  return normalized;
};

export const deleteStoryRecord = async (storyId: string) => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }

  await invoke("delete_story_record", {
    input: { id: storyId },
  });
};

export const loadStoryJson = async (record: StoryRecord): Promise<StoryJson> => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }

  const parsed = await readJsonWorkspaceFile(record.workspacePath, STORY_JSON_FILE);
  const story =
    normalizeStoryJsonForRecord(record, parsed) ??
    createDefaultStoryJson({
      id: record.id,
      title: record.name,
    });
  return story;
};

export const saveStoryJson = async (workspace: StoryWorkspace, story: StoryJson): Promise<StoryJson> => {
  const normalized =
    normalizeStoryJsonForRecord(
      {
        id: workspace.id,
        name: story.title,
        workspacePath: workspace.path,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      },
      {
        ...story,
        id: workspace.id,
      },
    ) ?? story;

  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }

  await writeJsonWorkspaceFile(workspace.path, STORY_MANIFEST_FILE, createStoryManifest(normalized));
  await writeJsonWorkspaceFile(workspace.path, STORY_JSON_FILE, normalized);
  return normalized;
};

export const createStory = async (
  input: CreateStoryInput,
): Promise<{
  record: StoryRecord;
  workspace: StoryWorkspace;
  story: StoryJson;
}> => {
  const record = await createStoryRecord(input);
  const workspace = storyWorkspaceFromRecord(record);
  const story = createDefaultStoryJson({
    id: record.id,
    title: record.name,
  });
  const savedStory = await saveStoryJson(workspace, story);

  return {
    record,
    workspace,
    story: savedStory,
  };
};

export const loadStoryLibrary = async (): Promise<StoryLibraryItem[]> => {
  const records = await listStoryRecords();
  return Promise.all(records.map(storyLibraryItemFromRecord));
};

export const loadStoryById = async (
  storyId: string,
): Promise<{
  record: StoryRecord;
  workspace: StoryWorkspace;
  story: StoryJson;
} | null> => {
  const record = (await listStoryRecords()).find((item) => item.id === storyId);
  if (!record) {
    return null;
  }

  return {
    record,
    workspace: storyWorkspaceFromRecord(record),
    story: await loadStoryJson(record),
  };
};
