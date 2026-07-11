import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
} from "@/features/pages/workspace/files-api";
import type { JsonValue, StoryJsonDocument } from "./types";

const STORY_ROOT = "story/";
const ignoredStoryPath = (path: string) => path === "story/tavern.json" || path.startsWith("story/runtime/");

export const loadStoryDocuments = async (workspacePath: string): Promise<StoryJsonDocument[]> => {
  const entries = await listWorkspaceFiles(workspacePath);
  const paths = entries
    .filter(
      (entry) =>
        !entry.isDirectory &&
        entry.path.startsWith(STORY_ROOT) &&
        entry.path.endsWith(".json") &&
        !ignoredStoryPath(entry.path),
    )
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    paths.map(async (path) => {
      const file = await readWorkspaceFile(workspacePath, path);
      let value: JsonValue;
      try {
        value = JSON.parse(file.content) as JsonValue;
      } catch {
        throw new Error(`故事 JSON 无法解析：${path}`);
      }
      return { path, value, updatedAt: file.updatedAt };
    }),
  );
};

export const saveStoryDocument = async (
  workspacePath: string,
  document: Pick<StoryJsonDocument, "path" | "value">,
): Promise<StoryJsonDocument> => {
  const file = await writeWorkspaceFile(workspacePath, document.path, `${JSON.stringify(document.value, null, 2)}\n`);
  return { ...document, updatedAt: file.updatedAt };
};

export const removeStoryDocument = async (workspacePath: string, path: string) => {
  await deleteWorkspaceFile(workspacePath, path);
};

export const normalizeStoryDocumentPath = (input: string) => {
  const path = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const rooted = path.startsWith(STORY_ROOT) ? path : `${STORY_ROOT}${path}`;
  const segments = rooted.split("/");
  if (
    !rooted.endsWith(".json") ||
    segments[0] !== "story" ||
    segments
      .slice(1)
      .some((segment) => !segment || segment === "." || segment === ".." || /[\0<>:"|?*]/.test(segment)) ||
    ignoredStoryPath(rooted)
  ) {
    throw new Error("文件路径必须是 story/ 下的安全 .json 路径，且不能使用 runtime 或 tavern.json。");
  }
  return rooted;
};
