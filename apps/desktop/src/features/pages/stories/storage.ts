import { invoke, isTauri } from "@tauri-apps/api/core";
import { createDefaultStoryJson, submitStoryManuscriptToStory, type StoryJson } from "./story/model/state";
import { normalizeStoryJson } from "./story/model/normalizer";
import type { StoryManuscriptSubmissionInput } from "./story/modules/manuscripts/manuscript-inbox";

const STORY_REGISTRY_STORAGE_KEY = "novel-claw:story:records";
const STORY_JSON_STORAGE_PREFIX = "novel-claw:story:json";
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

export type CreateStoryInput = {
  name: string;
  workspacePath: string;
};

type StoryManifest = {
  version: 1;
  id: string;
  name: string;
  updatedAt: number;
  entryNodeId?: string;
  activeNodeId?: string;
};

const storyWorkspaceFromRecord = (record: StoryRecord): StoryWorkspace => ({
  id: record.id,
  name: record.name,
  path: record.workspacePath,
});

const storyJsonStorageKey = (storyId: string) => `${STORY_JSON_STORAGE_PREFIX}:${storyId}`;

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
  version: 1,
  id: story.id,
  name: story.title,
  updatedAt: story.updatedAt,
  entryNodeId: story.graph.entryNodeId,
  activeNodeId: story.graph.activeNodeId,
});

const readJsonWorkspaceFile = async (workspacePath: string, relativePath: string): Promise<unknown | null> => {
  try {
    const file = await invoke<{ content: string }>("read_workspace_file", {
      input: { workspacePath, relativePath },
    });
    return JSON.parse(file.content);
  } catch {
    return null;
  }
};

const writeJsonWorkspaceFile = async (workspacePath: string, relativePath: string, value: unknown) => {
  await invoke("write_workspace_file", {
    input: {
      workspacePath,
      relativePath,
      content: JSON.stringify(value, null, 2),
    },
  });
};

const loadStoryRecordsFromLocalStorage = (): StoryRecord[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORY_REGISTRY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.flatMap((record) => {
          const normalized = normalizeStoryRecord(record);
          return normalized ? [normalized] : [];
        })
      : [];
  } catch {
    return [];
  }
};

const saveStoryRecordsToLocalStorage = (records: StoryRecord[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORY_REGISTRY_STORAGE_KEY, JSON.stringify(records));
};

export const listStoryRecords = async (): Promise<StoryRecord[]> => {
  if (!isTauri()) {
    return loadStoryRecordsFromLocalStorage();
  }

  const records = await invoke<unknown[]>("list_story_records");
  return records.flatMap((record) => {
    const normalized = normalizeStoryRecord(record);
    return normalized ? [normalized] : [];
  });
};

export const createStoryRecord = async (input: CreateStoryInput): Promise<StoryRecord> => {
  if (!isTauri()) {
    const now = Date.now();
    const record: StoryRecord = {
      id: `story-${crypto.randomUUID()}`,
      name: input.name.trim() || "未命名故事",
      workspacePath: input.workspacePath.trim() || `web-story-${now}`,
      createdAt: now,
      updatedAt: now,
    };
    saveStoryRecordsToLocalStorage([record, ...loadStoryRecordsFromLocalStorage()]);
    return record;
  }

  const record = await invoke<unknown>("create_story_record", {
    input: {
      name: input.name,
      workspacePath: input.workspacePath,
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
    const records = loadStoryRecordsFromLocalStorage();
    const now = Date.now();
    const nextRecords = records.map((record) => (record.id === storyId ? { ...record, name, updatedAt: now } : record));
    saveStoryRecordsToLocalStorage(nextRecords);
    const updated = nextRecords.find((record) => record.id === storyId);
    if (!updated) {
      throw new Error("故事记录不存在。");
    }
    return updated;
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
    const records = loadStoryRecordsFromLocalStorage().filter((record) => record.id !== storyId);
    saveStoryRecordsToLocalStorage(records);
    window.localStorage.removeItem(storyJsonStorageKey(storyId));
    return;
  }

  await invoke("delete_story_record", {
    input: { id: storyId },
  });
};

export const loadStoryJson = async (record: StoryRecord): Promise<StoryJson> => {
  if (!isTauri()) {
    try {
      const raw = window.localStorage.getItem(storyJsonStorageKey(record.id));
      const parsed = raw ? JSON.parse(raw) : null;
      return (
        normalizeStoryJsonForRecord(record, parsed) ??
        createDefaultStoryJson({
          id: record.id,
          title: record.name,
        })
      );
    } catch {
      return createDefaultStoryJson({
        id: record.id,
        title: record.name,
      });
    }
  }

  const parsed = await readJsonWorkspaceFile(record.workspacePath, STORY_JSON_FILE);
  return (
    normalizeStoryJsonForRecord(record, parsed) ??
    createDefaultStoryJson({
      id: record.id,
      title: record.name,
    })
  );
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
    window.localStorage.setItem(storyJsonStorageKey(workspace.id), JSON.stringify(normalized));
    return normalized;
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

export const loadStoryLibrary = async (): Promise<{
  records: StoryRecord[];
  workspacesByStoryId: Record<string, StoryWorkspace>;
  stories: StoryJson[];
}> => {
  const records = await listStoryRecords();
  const stories = await Promise.all(records.map(loadStoryJson));

  return {
    records,
    workspacesByStoryId: Object.fromEntries(records.map((record) => [record.id, storyWorkspaceFromRecord(record)])),
    stories,
  };
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

export const submitStoryManuscript = async (storyId: string, input: StoryManuscriptSubmissionInput) => {
  const loaded = await loadStoryById(storyId);
  if (!loaded) {
    throw new Error("找不到要收稿的故事。");
  }

  const submission = submitStoryManuscriptToStory(loaded.story, input);
  const story = await saveStoryJson(loaded.workspace, submission.story);
  if (!story) {
    throw new Error("稿件已提交，但无法读取保存后的故事。");
  }

  return {
    draft: submission.draft,
    story,
  };
};
