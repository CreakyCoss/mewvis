import { data } from "@/platform/bridge";
import {
  createStoryRecord as createStoryRecordApi,
  deleteStoryRecord as deleteStoryRecordApi,
  importStoryRecord as importStoryRecordApi,
  listStoryRecords as listStoryRecordsApi,
  updateStoryRecord as updateStoryRecordApi,
  type StoryRecord,
} from "@/platform/records";
import type {
  StoryDocument,
  StoryOverview,
  StoryProjectCompatibility,
  StoryProjectUpgradeResult,
} from "@story/project/types";
import { storyProjectApi } from "./project-client";

export const STORY_SOURCE_DIR = "story";
export const STORY_TAVERN_FILE = `${STORY_SOURCE_DIR}/tavern.json`;

export type { StoryRecord } from "@/platform/records";

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

export const listStoryRecords = listStoryRecordsApi;

export const createStoryRecord = (input: CreateStoryInput) =>
  createStoryRecordApi(input.name, input.workspaceParentPath);

export const importStoryRecord = importStoryRecordApi;

export const updateStoryRecordName = updateStoryRecordApi;

export const deleteStoryRecord = deleteStoryRecordApi;

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
  let reason = "所选目录不是 Mewvis 故事工作区。";

  for (const workspacePath of candidates) {
    const previous = await data().workspaces.list();
    const enrolled = await data().workspaces.create({ name: workspacePath.split(/[\\/]/).filter(Boolean).at(-1) || "故事", path: workspacePath });
    if (!enrolled) throw new Error("已取消导入故事");
    const compatibility = await storyProjectApi.checkCompatibility(enrolled.path);
    if (compatibility.status !== "compatible") {
      reason = compatibility.reason || reason;
      if (!previous.some(item => item.id === enrolled.id)) await data().workspaces.remove({ id: enrolled.id });
      continue;
    }

    const project = await storyProjectApi.open(enrolled.path);
    const [documents, overview] = await Promise.all([project.listDocuments(), project.overview()]);
    const fallbackName = workspacePath.split(/[\\/]/).filter(Boolean).at(-1) || "未命名故事";
    const record = await importStoryRecord(overview.title.trim() || fallbackName, enrolled.path);
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
