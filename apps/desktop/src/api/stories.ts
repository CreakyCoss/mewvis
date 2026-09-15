import { invoke } from "@/transport";

export type StoryRecord = {
  id: string;
  name: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
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

const requireStoryRecord = (value: unknown, errorMessage: string) => {
  const record = normalizeStoryRecord(value);
  if (!record) {
    throw new Error(errorMessage);
  }
  return record;
};

export const listStoryRecords = async (): Promise<StoryRecord[]> => {
  const records = await invoke<unknown[]>("list_story_records");
  return records.flatMap((record) => {
    const normalized = normalizeStoryRecord(record);
    return normalized ? [normalized] : [];
  });
};

export const createStoryRecord = async (name: string, workspacePath: string): Promise<StoryRecord> => {
  const record = await invoke<unknown>("create_story_record", {
    input: { name, workspacePath },
  });
  return requireStoryRecord(record, "故事记录创建后无法读取。");
};

export const importStoryRecord = async (name: string, workspacePath: string): Promise<StoryRecord> => {
  const record = await invoke<unknown>("import_story_record", {
    input: { name, workspacePath },
  });
  return requireStoryRecord(record, "故事记录导入后无法读取。");
};

export const updateStoryRecord = async (id: string, name: string): Promise<StoryRecord> => {
  const record = await invoke<unknown>("update_story_record", {
    input: { id, name },
  });
  return requireStoryRecord(record, "故事记录更新后无法读取。");
};

export const deleteStoryRecord = async (id: string, deleteContent = false) => {
  await invoke("delete_story_record", {
    input: { id, deleteContent },
  });
};
