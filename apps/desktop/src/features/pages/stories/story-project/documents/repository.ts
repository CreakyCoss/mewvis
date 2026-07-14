import { readWorkspaceFile, writeWorkspaceFilesAtomic } from "@/features/pages/workspace/files-api";
import type { StoryProjectApi } from "../../../../../../protocols/story-project";
import { loadStoryProjectApi } from "../workspace";
import { storyDocumentData } from "./model";
import type { JsonValue, StoryJsonDocument, StoryJsonDocumentDefinition } from "./types";

const STORY_ROOT = "story/";

const serializedContent = (value: ReturnType<StoryProjectApi["encodeDocument"]>) =>
  typeof value === "string" ? `${value.replace(/\s+$/, "")}\n` : `${JSON.stringify(value, null, 2)}\n`;

const readSerializedValue = async (workspacePath: string, path: string) => {
  const file = await readWorkspaceFile(workspacePath, path);
  if (path.endsWith(".md")) return { file, value: file.content as unknown };
  try {
    return { file, value: JSON.parse(file.content) as unknown };
  } catch {
    throw new Error(`故事 JSON 无法解析：${path}`);
  }
};

const editorDefinition = (projectApi: StoryProjectApi, path: string): StoryJsonDocumentDefinition => {
  const kind = projectApi.kindForPath(path);
  const document = projectApi.document(kind);
  return {
    kind,
    label: document.label,
    fields: projectApi.documentFields(kind) as StoryJsonDocumentDefinition["fields"],
    definitions: projectApi.describe().objectDefinitions as StoryJsonDocumentDefinition["definitions"],
  };
};

const loadProjectState = async (workspacePath: string, projectApi: StoryProjectApi) => {
  const manifestPath = projectApi.projectManifestPath();
  const manifestInput = await readSerializedValue(workspacePath, manifestPath);
  const manifest = projectApi.parseManifest(projectApi.decodeDocument(manifestInput.value, manifestPath));
  const entries = await Promise.all(
    manifest.files.map(async (file) => {
      const input = await readSerializedValue(workspacePath, file.path);
      return { path: file.path, value: projectApi.decodeDocument(input.value, file.path) };
    }),
  );
  const project = projectApi.assembleProject([{ path: manifestPath, value: manifest.value }, ...entries]);
  const validation = projectApi.validateProject(project, "draft");
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => `${issue.path}：${issue.message}`).join("\n"));
  }
  return { manifest, manifestPath, project };
};

export const loadStoryProject = async (workspacePath: string) => {
  const projectApi = await loadStoryProjectApi(workspacePath);
  const { project } = await loadProjectState(workspacePath, projectApi);
  return { projectApi, project };
};

const persistAppliedProject = async (
  workspacePath: string,
  projectApi: StoryProjectApi,
  applied: ReturnType<StoryProjectApi["applyChanges"]>,
) => {
  const manifestPath = projectApi.projectManifestPath();
  const nextFiles = new Map(projectApi.projectFiles(applied.project).map((entry) => [entry.path, entry.value]));
  const changed = new Set(applied.changedPaths);
  const files = [
    ...[...changed].flatMap((path) => {
      const value = nextFiles.get(path);
      return value === undefined
        ? []
        : [{ relativePath: path, content: serializedContent(projectApi.encodeDocument(value, path)) }];
    }),
    {
      relativePath: manifestPath,
      content: serializedContent(projectApi.encodeDocument(projectApi.projectManifest(applied.project), manifestPath)),
    },
  ];
  const deletePaths = [...changed].filter((path) => !nextFiles.has(path));
  await writeWorkspaceFilesAtomic(workspacePath, files, deletePaths);
};

const editableDocument = async (
  workspacePath: string,
  projectApi: StoryProjectApi,
  path: string,
): Promise<StoryJsonDocument> => {
  const input = await readSerializedValue(workspacePath, path);
  return {
    path,
    value: projectApi.decodeDocument(input.value, path) as JsonValue,
    definition: editorDefinition(projectApi, path),
    updatedAt: input.file.updatedAt,
  };
};

export const loadStoryDocuments = async (workspacePath: string): Promise<StoryJsonDocument[]> => {
  const projectApi = await loadStoryProjectApi(workspacePath);
  const { manifest } = await loadProjectState(workspacePath, projectApi);
  const paths = manifest.files.map((file) => file.path).sort((left, right) => left.localeCompare(right));
  return Promise.all(paths.map((path) => editableDocument(workspacePath, projectApi, path)));
};

export const saveStoryDocument = async (
  workspacePath: string,
  document: Pick<StoryJsonDocument, "path" | "value">,
): Promise<StoryJsonDocument> => {
  const projectApi = await loadStoryProjectApi(workspacePath);
  const { project } = await loadProjectState(workspacePath, projectApi);
  const info = projectApi.projectInfo(project);
  const data = storyDocumentData({ ...document, updatedAt: null }) ?? document.value;
  const applied = projectApi.applyChanges(project, {
    profileId: projectApi.identity.profileId,
    profileVersion: projectApi.identity.profileVersion,
    storyId: info.storyId,
    baseRevision: info.revision,
    validationProfile: "draft",
    operations: [{ type: "upsert", path: document.path, value: data }],
  });
  await persistAppliedProject(workspacePath, projectApi, applied);
  return editableDocument(workspacePath, projectApi, document.path);
};

export const removeStoryDocument = async (workspacePath: string, path: string) => {
  const projectApi = await loadStoryProjectApi(workspacePath);
  const kind = projectApi.kindForPath(path);
  if (projectApi.document(kind).cardinality === "one") {
    throw new Error(`Profile 要求「${projectApi.document(kind).label}」必须且只能存在一份，不能删除。`);
  }
  const { project } = await loadProjectState(workspacePath, projectApi);
  const info = projectApi.projectInfo(project);
  const current = projectApi.projectFiles(project).find((entry) => entry.path === path)?.value as
    { id?: unknown } | undefined;
  const id = typeof current?.id === "string" ? current.id : "";
  const pairedPaths =
    id && (kind === "story-chapter" || kind === "story-chapter-content")
      ? [
          projectApi.resolveDocument("story-chapter", { id }),
          projectApi.resolveDocument("story-chapter-content", { id }),
        ]
      : [path];
  const applied = projectApi.applyChanges(project, {
    profileId: projectApi.identity.profileId,
    profileVersion: projectApi.identity.profileVersion,
    storyId: info.storyId,
    baseRevision: info.revision,
    validationProfile: "draft",
    operations: [...new Set(pairedPaths)].map((targetPath) => ({ type: "delete", path: targetPath })),
  });
  await persistAppliedProject(workspacePath, projectApi, applied);
};

export const normalizeStoryDocumentPath = (input: string) => {
  const path = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const rooted = path.startsWith(STORY_ROOT) ? path : `${STORY_ROOT}${path}`;
  const segments = rooted.split("/");
  if (
    !rooted.endsWith(".json") ||
    segments[0] !== "story" ||
    segments.slice(1).some((segment) => !segment || segment === "." || segment === ".." || /[\0<>:"|?*]/.test(segment))
  ) {
    throw new Error("文件路径必须是 story/ 下由当前 Layout 管理的安全 .json 路径。 ");
  }
  return rooted;
};
