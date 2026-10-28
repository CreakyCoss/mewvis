import {
  getApplicationDataClient,
  type ApplicationDataClient,
  type ApplicationStorageValue,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import { isTemplateId, makeTemplate, type TemplateId } from "./fixtures";
import { copy, uid, validateModel, type Model } from "./model";

export interface Version {
  id: string;
  name: string;
  model: Model;
  createdAt: string;
}
export interface Project {
  id: string;
  model: Model;
  versions: Version[];
  workspaceId: string;
  path: string;
  templateId: TemplateId | null;
  createdAt: string;
}
export interface Workspace {
  format: "gameplay-workspace-v2";
  active: string;
  projects: Project[];
  errors: string[];
}
interface ProjectReference {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
}
interface ProjectMetadata {
  format: "gameplay-project-v2";
  id: string;
  templateId: TemplateId | null;
  createdAt: string;
  versions: Version[];
}
export const LIBRARY_KEY = "gameplay-lab:library:v2";
export const OBSOLETE_WORKSPACE_KEY = "gameplay-lab:workspace:v1";
export const MODEL_FILE = "models/core.json";
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const normalize = (path: string) => {
  const root = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:$/i.test(root) ? `${root}/` : root || "/";
};
export const projectFile = (path: string) =>
  `${normalize(path).replace(/\/$/, "")}/${MODEL_FILE}`;
export function projectDirectory(parent: string, name: string) {
  const root = normalize(parent.trim());
  if (!parent.trim() || !/^(\/|[a-z]:\/)/i.test(root))
    throw new Error("请选择项目父目录，或输入完整的绝对路径。");
  const leaf = name
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
    .trim();
  if (!leaf) throw new Error("项目名称不能用作文件夹名称。");
  return `${root.replace(/\/$/, "")}/${leaf}`;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
function validateVersions(value: unknown): value is Version[] {
  if (!Array.isArray(value) || value.length > 10) return false;
  const ids = new Set<string>();
  return value.every((v) => {
    if (
      !object(v) ||
      !identifier(v.id) ||
      ids.has(v.id) ||
      typeof v.name !== "string" ||
      typeof v.createdAt !== "string" ||
      validateModel(v.model).length
    )
      return false;
    ids.add(v.id);
    return true;
  });
}
export function initialWorkspace(): Workspace {
  return {
    format: "gameplay-workspace-v2",
    active: "",
    projects: [],
    errors: [],
  };
}
export function parseProjectDocument(
  value: unknown,
  location: { workspaceId: string; path: string },
): Project {
  if (!object(value) || !object(value.project))
    throw new Error("项目 JSON 格式不完整。");
  const { project: metadata, ...model } = value;
  if (
    metadata.format !== "gameplay-project-v2" ||
    !identifier(metadata.id) ||
    !(metadata.templateId === null || isTemplateId(metadata.templateId)) ||
    typeof metadata.createdAt !== "string" ||
    !validateVersions(metadata.versions) ||
    validateModel(model, true).length
  )
    throw new Error("项目 JSON 无法读取，原文件已保留。");
  return {
    id: metadata.id,
    workspaceId: location.workspaceId,
    path: normalize(location.path),
    templateId: metadata.templateId,
    createdAt: metadata.createdAt,
    model: model as unknown as Model,
    versions: metadata.versions,
  };
}
export function projectDocument(project: Project) {
  const metadata: ProjectMetadata = {
    format: "gameplay-project-v2",
    id: project.id,
    templateId: project.templateId,
    createdAt: project.createdAt,
    versions: copy(project.versions),
  };
  const document = { ...copy(project.model), project: metadata };
  parseProjectDocument(document, project);
  return document;
}
type Files = Pick<
  ApplicationFileClient,
  "mkdir" | "stat" | "readText" | "writeText"
>;
export function createProjectRepository(
  data: ApplicationDataClient,
  files: Files,
) {
  let writes: Promise<unknown> = Promise.resolve();
  const cache = new Map<
    string,
    { id: string; text: string; modifiedAt: number }
  >();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = writes.catch(() => {}).then(operation);
    writes = result;
    return result;
  };
  async function references(): Promise<ProjectReference[]> {
    const value = await data.storage.getItem(LIBRARY_KEY);
    if (value === null) return [];
    if (
      !object(value) ||
      value.format !== "gameplay-library-v2" ||
      !Array.isArray(value.projects) ||
      value.projects.length > 20
    )
      throw new Error("项目列表格式不完整，原索引已保留。");
    const ids = new Set<string>(),
      workspaces = new Set<string>();
    for (const r of value.projects) {
      if (
        !object(r) ||
        !identifier(r.id) ||
        typeof r.workspaceId !== "string" ||
        !r.workspaceId ||
        typeof r.path !== "string" ||
        typeof r.name !== "string" ||
        ids.has(r.id) ||
        workspaces.has(r.workspaceId)
      )
        throw new Error("项目列表格式不完整，原索引已保留。");
      ids.add(r.id);
      workspaces.add(r.workspaceId);
    }
    return value.projects as unknown as ProjectReference[];
  }
  async function addReference(project: Project) {
    const records = await references();
    if (
      records.some(
        (r) => r.id === project.id && r.workspaceId !== project.workspaceId,
      )
    )
      throw new Error("相同项目已登记在另一个目录，请先使用原项目目录。");
    const record: ProjectReference = {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.model.name,
      path: project.path,
    };
    const remaining = records.filter(
      (r) => r.id !== project.id && r.workspaceId !== project.workspaceId,
    );
    if (remaining.length >= 20) throw new Error("首版最多保存 20 个项目。");
    await data.storage.setItem(LIBRARY_KEY, {
      format: "gameplay-library-v2",
      projects: [...remaining, record],
    } as unknown as ApplicationStorageValue);
  }
  async function read(workspaceId: string): Promise<Project> {
    const workspace = await data.workspaces.get(workspaceId);
    const path = projectFile(workspace.path);
    const before = await files.stat(path);
    const text = await files.readText(path, { maxBytes: 4 * 1024 * 1024 });
    const after = await files.stat(path);
    if (before.modifiedAt !== after.modifiedAt || before.size !== after.size)
      throw new Error("项目文件正在被修改，请重新打开。");
    const project = parseProjectDocument(JSON.parse(text), {
      workspaceId,
      path: workspace.path,
    });
    cache.set(workspaceId, {
      id: project.id,
      text: json(projectDocument(project)),
      modifiedAt: after.modifiedAt,
    });
    return project;
  }
  async function save(project: Project) {
    const text = json(projectDocument(project));
    const previous = cache.get(project.workspaceId);
    if (previous && previous.id !== project.id)
      throw new Error("项目文件的标识已变化，请从项目库重新打开。");
    if (previous?.text === text) return;
    if (!previous) throw new Error("请先重新打开项目，再保存修改。");
    const workspace = await data.workspaces.get(project.workspaceId);
    if (normalize(workspace.path) !== project.path)
      throw new Error("项目目录已变化，请重新打开。");
    const info = await files.writeText(projectFile(project.path), text, {
      overwrite: true,
      expectedModifiedAt: previous.modifiedAt,
    });
    cache.set(project.workspaceId, {
      id: project.id,
      text,
      modifiedAt: info.modifiedAt,
    });
  }
  return {
    async list(): Promise<Workspace> {
      await writes.catch(() => {});
      await data.storage.removeItem(OBSOLETE_WORKSPACE_KEY);
      const state = initialWorkspace(),
        records = await references();
      for (const reference of records) {
        try {
          const project = await read(reference.workspaceId);
          if (project.id !== reference.id)
            throw new Error("项目标识与索引不一致。");
          state.projects.push(project);
        } catch (error) {
          state.errors.push(
            `${reference.name}（${reference.path}）：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return state;
    },
    saveWorkspace(workspace: Workspace) {
      const snapshot = copy(workspace.projects);
      return serialize(async () => {
        for (const project of snapshot) await save(project);
      });
    },
    flush: () => writes,
    selectDirectory: () => data.workspaces.selectDirectory(),
    create(input: {
      name: string;
      parent: string;
      templateId: TemplateId;
    }): Promise<Project | null> {
      return serialize(async () => {
        const records = await references();
        if (records.length >= 20) throw new Error("首版最多保存 20 个项目。");
        const name = input.name.trim();
        if (!name || name.length > 60)
          throw new Error("请输入 1–60 字的项目名称。");
        if (!isTemplateId(input.templateId))
          throw new Error("请选择内置模板。");
        const directory = projectDirectory(input.parent, name);
        const workspace = await data.workspaces.create({
          name,
          path: directory,
          exclusive: true,
        });
        if (!workspace) return null;
        const model = makeTemplate(input.templateId);
        model.id = uid("model");
        model.name = name;
        const project: Project = {
          id: uid("project"),
          workspaceId: workspace.id,
          path: normalize(workspace.path),
          templateId: input.templateId,
          createdAt: new Date().toISOString(),
          model,
          versions: [],
        };
        try {
          await files.mkdir(`${project.path}/models`);
          const text = json(projectDocument(project));
          const info = await files.writeText(projectFile(project.path), text);
          cache.set(workspace.id, {
            id: project.id,
            text,
            modifiedAt: info.modifiedAt,
          });
        } catch (error) {
          await data.workspaces
            .remove({ id: workspace.id, deleteContent: true })
            .catch(() => {});
          throw error;
        }
        try {
          await addReference(project);
        } catch (error) {
          throw new Error(
            `项目文件已保存在 ${project.path}，但项目列表保存失败。请用“打开项目”重新加入。${String(error)}`,
          );
        }
        return project;
      });
    },
    open(path?: string): Promise<Project | null> {
      return serialize(async () => {
        const workspace = await data.workspaces.create({
          name: "游戏沙盘项目",
          ...(path ? { path } : {}),
        });
        if (!workspace) return null;
        const project = await read(workspace.id);
        await addReference(project);
        return project;
      });
    },
    reload(project: Project) {
      return serialize(async () => {
        const value = await read(project.workspaceId);
        if (value.id !== project.id)
          throw new Error("项目标识已变化，请从项目库重新打开。");
        return value;
      });
    },
    reset(
      project: Project,
      templateId: TemplateId,
    ): Promise<{ project: Project; backup: string }> {
      const snapshot = copy(project);
      return serialize(async () => {
        if (!isTemplateId(templateId)) throw new Error("请选择内置模板。");
        await save(snapshot);
        // Back up the actual file after checking for external edits, before replacement.
        const actual = await read(snapshot.workspaceId);
        if (json(projectDocument(actual)) !== json(projectDocument(snapshot))) {
          cache.delete(snapshot.workspaceId);
          throw new Error(
            "项目文件已在外部修改，请重新读取后再切换模板或重置。",
          );
        }
        const backup = `${snapshot.path}/backups/${new Date().toISOString().replaceAll(":", "-")}-${uid("rules")}.json`;
        await files.mkdir(`${snapshot.path}/backups`);
        await files.writeText(backup, json(projectDocument(snapshot)));
        const model = makeTemplate(templateId);
        model.id = snapshot.model.id;
        model.name = snapshot.model.name;
        const next = { ...snapshot, model, templateId };
        await save(next);
        return { project: next, backup };
      });
    },
  };
}
let currentRepository: ReturnType<typeof createProjectRepository> | undefined;
export function projectRepository() {
  return (currentRepository ??= createProjectRepository(
    getApplicationDataClient(),
    {
      mkdir: (...args) => getApplicationFileClient().mkdir(...args),
      stat: (...args) => getApplicationFileClient().stat(...args),
      readText: (...args) => getApplicationFileClient().readText(...args),
      writeText: (...args) => getApplicationFileClient().writeText(...args),
    },
  ));
}
export const loadWorkspace = () => projectRepository().list();
export const saveWorkspace = (workspace: Workspace) =>
  projectRepository().saveWorkspace(workspace);
