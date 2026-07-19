import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  StoryDocument,
  StoryOverview,
  StoryProjectCompatibility,
  StoryProjectUpgradeResult,
} from "../../../../core/story-project/types";
import { storyProjectApi } from "./project-client";

export const STORY_SOURCE_DIR = "story";
export const STORY_TAVERN_FILE = `${STORY_SOURCE_DIR}/tavern.json`;

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
  documents: StoryDocument[];
  overview: StoryOverview;
  workspace: StoryWorkspace;
};

export type StoryLibraryEntry =
  | (StoryLibraryItem & Readonly<{ status: "ready" }>)
  | Readonly<{
      status: "unavailable";
      id: string;
      workspace: StoryWorkspace;
      compatibility: StoryProjectCompatibility;
    }>;

export type CreateStoryInput = {
  name: string;
  storyTypeId: string;
  workspaceParentPath: string;
};

const storyWorkspaceFromRecord = (record: StoryRecord): StoryWorkspace => ({
  id: record.id,
  name: record.name,
  path: record.workspacePath,
});

const storyLibraryItemFromRecord = async (record: StoryRecord): Promise<StoryLibraryItem> => {
  const project = await storyProjectApi.open(record.workspacePath);
  const [documents, overview] = await Promise.all([project.listDocuments(), project.overview()]);
  return {
    id: record.id,
    documents,
    overview,
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

export const importStoryRecord = async (name: string, workspacePath: string): Promise<StoryRecord> => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }

  const record = await invoke<unknown>("import_story_record", {
    input: { name, workspacePath },
  });
  const normalized = normalizeStoryRecord(record);
  if (!normalized) {
    throw new Error("故事记录导入后无法读取。");
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

export const deleteStoryRecord = async (storyId: string, deleteContent = false) => {
  if (!isTauri()) {
    throw createDesktopOnlyStoryStorageError();
  }

  await invoke("delete_story_record", {
    input: { id: storyId, deleteContent },
  });
};

export const createStory = async (
  input: CreateStoryInput,
): Promise<{
  record: StoryRecord;
  workspace: StoryWorkspace;
  documents: StoryDocument[];
  overview: StoryOverview;
}> => {
  const record = await createStoryRecord(input);
  const workspace = storyWorkspaceFromRecord(record);
  try {
    const project = await storyProjectApi.create(workspace.path, {
      storyTypeId: input.storyTypeId,
      storyId: record.id,
      title: record.name,
    });
    const [documents, overview] = await Promise.all([project.listDocuments(), project.overview()]);
    return {
      record,
      workspace,
      documents,
      overview,
    };
  } catch (error) {
    await deleteStoryRecord(record.id, true).catch(() => undefined);
    throw error;
  }
};

const importWorkspaceCandidates = (selectedPath: string) => {
  const normalized = selectedPath.trim().replace(/[\\/]+$/, "");
  if (!normalized) return [];

  const candidates = [normalized];
  if (/[\\/]story$/i.test(normalized)) {
    candidates.push(normalized.replace(/[\\/]story$/i, ""));
  }
  return [...new Set(candidates.filter(Boolean))];
};

export const importStory = async (selectedPath: string): Promise<StoryLibraryItem> => {
  const candidates = importWorkspaceCandidates(selectedPath);
  let reason = "所选目录不是 Novel Claw 故事工作区。";

  for (const workspacePath of candidates) {
    const compatibility = await storyProjectApi.checkCompatibility(workspacePath);
    if (compatibility.status !== "compatible") {
      reason = compatibility.reason || reason;
      continue;
    }

    const project = await storyProjectApi.open(workspacePath);
    const [documents, overview] = await Promise.all([project.listDocuments(), project.overview()]);
    const fallbackName = workspacePath.split(/[\\/]/).filter(Boolean).at(-1) || "未命名故事";
    const record = await importStoryRecord(overview.title.trim() || fallbackName, workspacePath);
    return {
      id: record.id,
      documents,
      overview,
      workspace: storyWorkspaceFromRecord(record),
    };
  }

  throw new Error(`无法导入故事：${reason}`);
};

export const loadStoryLibrary = async (): Promise<StoryLibraryEntry[]> => {
  const records = await listStoryRecords();
  return Promise.all(
    records.map(async (record) => {
      try {
        return { ...(await storyLibraryItemFromRecord(record)), status: "ready" as const };
      } catch (error) {
        console.warn("Story workspace is unavailable", record.id, error);
        const compatibility = await storyProjectApi.checkCompatibility(record.workspacePath).catch((checkError) => ({
          status: "incompatible" as const,
          current: null,
          target: null,
          reason: checkError instanceof Error ? checkError.message : String(checkError),
        }));
        return {
          status: "unavailable" as const,
          id: record.id,
          workspace: storyWorkspaceFromRecord(record),
          compatibility,
        };
      }
    }),
  );
};

export const upgradeStoryProject = (workspace: StoryWorkspace): Promise<StoryProjectUpgradeResult> =>
  storyProjectApi.upgrade(workspace.path);

export const loadStoryById = async (storyId: string): Promise<StoryLibraryItem | null> => {
  const record = (await listStoryRecords()).find((item) => item.id === storyId);
  return record ? storyLibraryItemFromRecord(record) : null;
};
