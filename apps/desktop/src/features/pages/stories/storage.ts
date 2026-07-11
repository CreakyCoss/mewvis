import { invoke, isTauri } from "@tauri-apps/api/core";
import { listWorkspaceFiles } from "../workspace/files-api";
import { createDefaultStoryJson } from "./story/model/state";
import type { StoryJson } from "./story/model/types";
import {
  storyJsonToProject,
  loadStoryProject,
  saveStoryProject as saveStoryProjectFiles,
  storyProjectToStoryJson,
  type StoryProject,
  type StoryValidationProfile,
} from "./story-contract";

export const STORY_SOURCE_DIR = "story";
export const STORY_TAVERN_FILE = `${STORY_SOURCE_DIR}/tavern.json`;
const REMOVED_STORY_JSON_PATH = `${STORY_SOURCE_DIR}/story.json`;

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
  project: StoryProject;
  story: StoryJson;
  workspace: StoryWorkspace;
};

export type CreateStoryInput = {
  name: string;
  workspaceParentPath: string;
};

const storyWorkspaceFromRecord = (record: StoryRecord): StoryWorkspace => ({
  id: record.id,
  name: record.name,
  path: record.workspacePath,
});

const storyLibraryItemFromRecord = async (record: StoryRecord): Promise<StoryLibraryItem> => {
  const project = await loadStoryProject(record.workspacePath);
  return {
    id: record.id,
    project,
    story: storyProjectToStoryJson(project),
    workspace: storyWorkspaceFromRecord(record),
  };
};

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

  return storyProjectToStoryJson(await loadStoryProject(record.workspacePath));
};

export const saveStoryJson = async (workspace: StoryWorkspace, story: StoryJson): Promise<StoryJson> => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }
  const existingProject = await loadStoryProject(workspace.path);
  const project = storyJsonToProject({ ...story, id: workspace.id }, existingProject);
  const savedProject = await saveStoryProjectFiles(workspace.path, project, "draft");
  return storyProjectToStoryJson(savedProject);
};

export const saveStoryProject = async (
  workspace: StoryWorkspace,
  project: StoryProject,
  profile: StoryValidationProfile = "draft",
) => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }
  if (project.manifest.storyId !== workspace.id) {
    throw new Error("故事项目 ID 与工作区记录不一致。");
  }
  return saveStoryProjectFiles(workspace.path, project, profile);
};

export const createStory = async (
  input: CreateStoryInput,
): Promise<{
  record: StoryRecord;
  workspace: StoryWorkspace;
  project: StoryProject;
  story: StoryJson;
}> => {
  const record = await createStoryRecord(input);
  const workspace = storyWorkspaceFromRecord(record);
  const story = createDefaultStoryJson({
    id: record.id,
    title: record.name,
  });
  const project = storyJsonToProject(story);
  try {
    const savedProject = await saveStoryProjectFiles(workspace.path, project, "draft");
    return {
      record,
      workspace,
      project: savedProject,
      story: storyProjectToStoryJson(savedProject),
    };
  } catch (error) {
    await deleteStoryRecord(record.id).catch(() => undefined);
    throw error;
  }
};

export const loadStoryLibrary = async (): Promise<StoryLibraryItem[]> => {
  const records = await listStoryRecords();
  const results = await Promise.all(
    records.map(async (record) => {
      try {
        return await storyLibraryItemFromRecord(record);
      } catch (error) {
        const files = await listWorkspaceFiles(record.workspacePath).catch(() => []);
        if (files.some((file) => !file.isDirectory && file.path === REMOVED_STORY_JSON_PATH)) {
          await deleteStoryRecord(record.id).catch((deleteError) => {
            console.error("Failed to remove old story project", deleteError);
          });
          console.info("Removed unsupported story.json project", record.id);
          return null;
        }
        console.warn("Skipping invalid structured story project", error);
        return null;
      }
    }),
  );
  return results.flatMap((result) => {
    if (result) {
      return [result];
    }
    return [];
  });
};

export const loadStoryById = async (
  storyId: string,
): Promise<{
  record: StoryRecord;
  workspace: StoryWorkspace;
  story: StoryJson;
  project: StoryProject;
} | null> => {
  const record = (await listStoryRecords()).find((item) => item.id === storyId);
  if (!record) {
    return null;
  }

  const project = await loadStoryProject(record.workspacePath);
  return {
    record,
    workspace: storyWorkspaceFromRecord(record),
    project,
    story: storyProjectToStoryJson(project),
  };
};
