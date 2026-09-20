import { call, data } from "./bridge";
export type StoryRecord = {
  id: string;
  name: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
};
export const listStoryRecords = () =>
  call<StoryRecord[]>("isle_story_library", { action: "list" });
export async function createStoryRecord(
  name: string,
  parentPath: string,
): Promise<StoryRecord> {
  const leaf = name
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
    .trim();
  if (!leaf) throw new Error("故事目录名不能为空");
  const workspace = await data().workspaces.create({
    name,
    exclusive: true,
    path: parentPath.replace(/[\\/]+$/, "") + "/" + leaf,
  });
  if (!workspace) throw new Error("已取消创建故事");
  try {
    return await call("isle_story_library", {
      action: "add",
      workspaceId: workspace.id,
      name,
      requireEmpty: true,
    });
  } catch (error) {
    await data()
      .workspaces.remove({ id: workspace.id, deleteContent: true })
      .catch(() => undefined);
    throw error;
  }
}
export async function importStoryRecord(
  name: string,
  path: string,
): Promise<StoryRecord> {
  const workspace = await data().workspaces.create({ name, path });
  if (!workspace) throw new Error("已取消导入故事");
  return call("isle_story_library", {
    action: "add",
    workspaceId: workspace.id,
    name,
  });
}
export const updateStoryRecord = (
  id: string,
  name: string,
): Promise<StoryRecord> =>
  call("isle_story_library", { action: "rename", id, name });
export const deleteStoryRecord = (
  id: string,
  deleteContent = false,
): Promise<void> =>
  call("isle_story_library", { action: "remove", id, deleteContent });
