import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  createStandaloneStoryAsset,
  submitStoryManuscriptToState,
  type StoryAsset,
  type StoryState,
} from "./application/state";
import { normalizeStoryState } from "./application/state-normalize";
import type { StoryManuscriptSubmissionInput } from "./application/manuscript-inbox";

const STORY_REGISTRY_STORAGE_KEY = "novel-claw:story:records";
const STORY_ASSET_STORAGE_PREFIX = "novel-claw:story:asset";
const STORY_SOURCE_DIR = "story";
const STORY_MANIFEST_FILE = `${STORY_SOURCE_DIR}/manifest.json`;
const STORY_ASSET_FILE = `${STORY_SOURCE_DIR}/story.json`;

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

const storyAssetStorageKey = (storyId: string) => `${STORY_ASSET_STORAGE_PREFIX}:${storyId}`;

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

const normalizeStoryAssetForRecord = (record: StoryRecord, value: unknown): StoryAsset | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = {
    ...(value as Record<string, unknown>),
    id: record.id,
    workspaceId: record.id,
    title: typeof (value as { title?: unknown }).title === "string" ? (value as { title: string }).title : record.name,
  };
  const state = normalizeStoryState(record.id, {
    version: 1,
    activeStoryId: record.id,
    stories: [candidate],
  });

  return state?.stories[0] ?? null;
};

const createStoryManifest = (story: StoryAsset): StoryManifest => ({
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
    window.localStorage.removeItem(storyAssetStorageKey(storyId));
    return;
  }

  await invoke("delete_story_record", {
    input: { id: storyId },
  });
};

export const loadStoryAsset = async (record: StoryRecord): Promise<StoryAsset> => {
  if (!isTauri()) {
    try {
      const raw = window.localStorage.getItem(storyAssetStorageKey(record.id));
      const parsed = raw ? JSON.parse(raw) : null;
      return (
        normalizeStoryAssetForRecord(record, parsed) ??
        createStandaloneStoryAsset({
          id: record.id,
          workspaceId: record.id,
          title: record.name,
        })
      );
    } catch {
      return createStandaloneStoryAsset({
        id: record.id,
        workspaceId: record.id,
        title: record.name,
      });
    }
  }

  const parsed = await readJsonWorkspaceFile(record.workspacePath, STORY_ASSET_FILE);
  return (
    normalizeStoryAssetForRecord(record, parsed) ??
    createStandaloneStoryAsset({
      id: record.id,
      workspaceId: record.id,
      title: record.name,
    })
  );
};

export const saveStoryAsset = async (workspace: StoryWorkspace, story: StoryAsset): Promise<StoryAsset> => {
  const normalized =
    normalizeStoryAssetForRecord(
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
        workspaceId: workspace.id,
      },
    ) ?? story;

  if (!isTauri()) {
    window.localStorage.setItem(storyAssetStorageKey(workspace.id), JSON.stringify(normalized));
    return normalized;
  }

  await writeJsonWorkspaceFile(workspace.path, STORY_MANIFEST_FILE, createStoryManifest(normalized));
  await writeJsonWorkspaceFile(workspace.path, STORY_ASSET_FILE, normalized);
  return normalized;
};

export const createStory = async (
  input: CreateStoryInput,
): Promise<{
  record: StoryRecord;
  workspace: StoryWorkspace;
  story: StoryAsset;
}> => {
  const record = await createStoryRecord(input);
  const workspace = storyWorkspaceFromRecord(record);
  const story = createStandaloneStoryAsset({
    id: record.id,
    workspaceId: record.id,
    title: record.name,
  });
  const savedStory = await saveStoryAsset(workspace, story);

  return {
    record,
    workspace,
    story: savedStory,
  };
};

export const loadStoryLibrary = async (
  requestedStoryId = "",
): Promise<{
  records: StoryRecord[];
  workspacesByStoryId: Record<string, StoryWorkspace>;
  state: StoryState;
}> => {
  const records = await listStoryRecords();
  const stories = await Promise.all(records.map(loadStoryAsset));
  const activeStoryId =
    requestedStoryId && stories.some((story) => story.id === requestedStoryId)
      ? requestedStoryId
      : (stories[0]?.id ?? "");

  return {
    records,
    workspacesByStoryId: Object.fromEntries(records.map((record) => [record.id, storyWorkspaceFromRecord(record)])),
    state: {
      version: 1,
      activeStoryId,
      stories,
    },
  };
};

export const loadStoryById = async (
  storyId: string,
): Promise<{
  record: StoryRecord;
  workspace: StoryWorkspace;
  story: StoryAsset;
} | null> => {
  const record = (await listStoryRecords()).find((item) => item.id === storyId);
  if (!record) {
    return null;
  }

  return {
    record,
    workspace: storyWorkspaceFromRecord(record),
    story: await loadStoryAsset(record),
  };
};

export const submitStoryManuscript = async (
  storyId: string,
  input: StoryManuscriptSubmissionInput,
) => {
  const loaded = await loadStoryById(storyId);
  if (!loaded) {
    throw new Error("找不到要收稿的故事。");
  }

  const currentState: StoryState = {
    version: 1,
    activeStoryId: loaded.story.id,
    stories: [loaded.story],
  };
  const submission = submitStoryManuscriptToState(currentState, input);
  const story = await saveStoryAsset(loaded.workspace, submission.story);
  if (!story) {
    throw new Error("稿件已提交，但无法读取保存后的故事。");
  }

  return {
    draft: submission.draft,
    story,
    state: {
      version: 1 as const,
      activeStoryId: story.id,
      stories: [story],
    },
  };
};
