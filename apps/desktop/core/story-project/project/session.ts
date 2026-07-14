import {
  loadStoryDocuments,
  loadStoryProject,
  normalizeStoryDocumentPath,
  removeStoryDocument,
  saveStoryDocument,
} from "../documents/repository.js";
import type { StoryContextBundle } from "../types.js";
import type { StoryProjectDocument } from "../documents/types.js";
import { createStoryProject as initializeStoryProject, loadStoryProjectApi } from "./workspace.js";

export type StoryProjectOverview = Readonly<{
  id: string;
  title: string;
  description: string;
  goal: string;
  lengthType: string;
  createdAt: number;
  updatedAt: number;
  characters: readonly Readonly<{ id: string; name: string; avatar: string }>[];
  resourceCounts: Readonly<{
    characters: number;
    chapters: number;
    worldEntries: number;
  }>;
}>;

/** 绑定到一个桌面工作区的故事项目能力；页面无需了解 Manifest、Layout 或文件路径。 */
export interface StoryProjectWorkspaceApi {
  readonly workspacePath: string;
  listDocuments(input?: { role?: string }): Promise<StoryProjectDocument[]>;
  saveDocument(document: Pick<StoryProjectDocument, "path" | "value">): Promise<StoryProjectDocument>;
  removeDocument(path: string): Promise<void>;
  normalizeDocumentPath(path: string): string;
  readContext(input: { scope: "project" | "chapter"; targetId?: string }): Promise<StoryContextBundle>;
  overview(): Promise<StoryProjectOverview>;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stringValue = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const numberValue = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const readWorkspaceOverview = async (workspacePath: string): Promise<StoryProjectOverview> => {
  const { projectApi, project } = await loadStoryProject(workspacePath);
  const roles = projectApi.describe().documentRoles;
  const files = projectApi.projectFiles(project);
  const valuesForRole = (role: string) => {
    const kind = roles[role];
    return kind
      ? files.flatMap((entry) =>
          projectApi.kindForPath(entry.path) === kind && isObject(entry.value) ? [entry.value] : [],
        )
      : [];
  };
  const primary = valuesForRole("primary")[0] ?? {};
  const positioning = valuesForRole("positioning")[0] ?? {};
  const manifest = projectApi.projectManifest(project);
  const manifestValue = isObject(manifest) ? manifest : {};
  const characters = valuesForRole("character").map((character) => ({
    id: stringValue(character.id),
    name: stringValue(character.name),
    avatar: stringValue(character.avatar, "blank-avatar"),
  }));
  const info = projectApi.projectInfo(project);
  return {
    id: info.storyId,
    title: stringValue(primary.title, stringValue(manifestValue.title, "未命名故事")),
    description: stringValue(primary.premise),
    goal: stringValue(primary.goal),
    lengthType: stringValue(positioning.lengthType),
    createdAt: numberValue(primary.createdAt, numberValue(manifestValue.createdAt, Date.now())),
    updatedAt: numberValue(manifestValue.updatedAt, Date.now()),
    characters,
    resourceCounts: {
      characters: characters.length,
      chapters: valuesForRole("chapterPlan").length,
      worldEntries: valuesForRole("worldEntry").length,
    },
  };
};

const listWorkspaceDocuments = async (workspacePath: string, input?: { role?: string }) => {
  const documents = await loadStoryDocuments(workspacePath);
  if (!input?.role) return documents;
  const projectApi = await loadStoryProjectApi(workspacePath);
  const kind = projectApi.describe().documentRoles[input.role];
  if (!kind) throw new Error(`当前故事类型没有提供 ${input.role} 文档角色。`);
  return documents.filter((document) => document.definition?.kind === kind);
};

const readWorkspaceContext = async (
  workspacePath: string,
  input: { scope: "project" | "chapter"; targetId?: string },
) => {
  const { projectApi, project } = await loadStoryProject(workspacePath);
  return projectApi.readContext(project, input);
};

const bindStoryProjectWorkspace = (workspacePath: string): StoryProjectWorkspaceApi =>
  Object.freeze({
    workspacePath,
    listDocuments: (input?: { role?: string }) => listWorkspaceDocuments(workspacePath, input),
    saveDocument: (document: Pick<StoryProjectDocument, "path" | "value">) =>
      saveStoryDocument(workspacePath, document),
    removeDocument: (path: string) => removeStoryDocument(workspacePath, path),
    normalizeDocumentPath: normalizeStoryDocumentPath,
    readContext: (input: { scope: "project" | "chapter"; targetId?: string }) =>
      readWorkspaceContext(workspacePath, input),
    overview: () => readWorkspaceOverview(workspacePath),
  });

export const openStoryProjectWorkspace = async (workspacePath: string): Promise<StoryProjectWorkspaceApi> => {
  await loadStoryProjectApi(workspacePath);
  return bindStoryProjectWorkspace(workspacePath);
};

export const createStoryProjectWorkspace = async (
  workspacePath: string,
  input: { storyTypeId: string; storyId: string; title: string },
): Promise<StoryProjectWorkspaceApi> => {
  await initializeStoryProject(workspacePath, input);
  return bindStoryProjectWorkspace(workspacePath);
};
