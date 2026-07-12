import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
} from "@/features/pages/workspace/files-api";
import type { JsonValue, StoryJsonDocument } from "./types";
import { STORY_PROJECT_CONTRACT_LOCK_PATH, STORY_PROJECT_CONTRACT_PATH } from "../../../../../protocols/story-project";
import { loadStoryProjectContract } from "../contracts/workspace";

const STORY_ROOT = "story/";
const ignoredStoryPath = (path: string) =>
  path === "story/tavern.json" ||
  path.startsWith("story/runtime/") ||
  path === STORY_PROJECT_CONTRACT_PATH ||
  path === STORY_PROJECT_CONTRACT_LOCK_PATH;

export const loadStoryDocuments = async (workspacePath: string): Promise<StoryJsonDocument[]> => {
  const contract = await loadStoryProjectContract(workspacePath);
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
      contract.decodeDocument(value, path);
      return { path, value, updatedAt: file.updatedAt };
    }),
  );
};

export const saveStoryDocument = async (
  workspacePath: string,
  document: Pick<StoryJsonDocument, "path" | "value">,
): Promise<StoryJsonDocument> => {
  const contract = await loadStoryProjectContract(workspacePath);
  const value =
    document.value &&
    typeof document.value === "object" &&
    !Array.isArray(document.value) &&
    "$format" in document.value
      ? (contract.decodeDocument(document.value, document.path), document.value)
      : contract.encodeDocument(document.value, document.path);
  const file = await writeWorkspaceFile(workspacePath, document.path, `${JSON.stringify(value, null, 2)}\n`);
  return { ...document, value: value as JsonValue, updatedAt: file.updatedAt };
};

export const removeStoryDocument = async (workspacePath: string, path: string) => {
  const contract = await loadStoryProjectContract(workspacePath);
  const kind = contract.kindForPath(path);
  if (contract.document(kind).cardinality === "one") {
    throw new Error(`协议要求「${contract.document(kind).label}」必须且只能存在一份，不能删除。`);
  }
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
