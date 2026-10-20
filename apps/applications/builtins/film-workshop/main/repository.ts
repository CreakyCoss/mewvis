import type {
  ApplicationStorage,
  ApplicationWorkspaces,
} from "@mewvis/app-sdk/data";
import type { ApplicationFileClient } from "@mewvis/app-sdk/files";
import { validateProject, type FilmProject } from "./model";
import { resumeView, type FilmView } from "./view-state";

const prefix = "film:project:";
const normalizeRoot = (path: string) => {
  const root = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:$/i.test(root) ? `${root}/` : root || "/";
};
const projectDirectory = (root: string, id: string) =>
  `${root.replace(/\/+$/, "")}/film-projects/${id}`;
export const projectKey = (id: string) => prefix + id;
export function createRepository(
  storage: ApplicationStorage,
  services: {
    files: ApplicationFileClient;
    workspaces: ApplicationWorkspaces;
  },
) {
  let writes: Promise<void> = Promise.resolve();
  const serialize = (write: () => Promise<void>) => {
    const result = writes.catch(() => {}).then(write);
    writes = result;
    return result;
  };
  return {
    async attach(
      project: FilmProject,
      path?: string,
    ): Promise<FilmProject | null> {
      const workspace = await services.workspaces.create({
        name: project.title,
        ...(path ? { path } : {}),
      });
      if (!workspace) return null;
      const root = normalizeRoot(workspace.path);
      const directory = projectDirectory(root, project.id);
      for (const folder of [
        directory,
        `${directory}/media`,
        `${directory}/generated`,
      ])
        await services.files.mkdir(folder);
      return validateProject({
        ...project,
        workspace: { id: workspace.id, root, directory },
      });
    },
    async list(): Promise<FilmProject[]> {
      const keys = (await storage.keys()).filter((key) =>
        key.startsWith(prefix),
      );
      const projects: FilmProject[] = [];
      for (const key of keys) {
        const value = await storage.getItem<Record<string, unknown>>(key);
        if (
          value?.format !== "mewvis-film-project-index" ||
          typeof value.workspaceId !== "string" ||
          !value.workspaceId.trim() ||
          typeof value.id !== "string" ||
          key !== projectKey(value.id) ||
          !/^[a-zA-Z0-9_-]+$/.test(value.id)
        )
          throw new Error("影视项目索引无效");
        const workspace = await services.workspaces.get(value.workspaceId);
        const directory = projectDirectory(
          normalizeRoot(workspace.path),
          value.id,
        );
        const project = validateProject(
          JSON.parse(
            await services.files.readText(`${directory}/project.json`),
          ),
        );
        if (
          project.workspace?.id !== workspace.id ||
          project.workspace.directory !== directory
        )
          throw new Error("项目工作目录与索引不一致");
        if (key !== projectKey(project.id))
          throw new Error("影视项目标识与存储键不一致");
        projects.push(project);
      }
      return projects.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    save(project: FilmProject) {
      const snapshot = validateProject(project);
      return serialize(async () => {
        if (!snapshot.workspace) throw new Error("请先选择项目工作目录");
        const workspace = await services.workspaces.get(snapshot.workspace.id);
        if (normalizeRoot(workspace.path) !== snapshot.workspace.root)
          throw new Error("项目工作目录已变化");
        await services.files.writeText(
          `${snapshot.workspace.directory}/project.json`,
          JSON.stringify(snapshot, null, 2),
          { overwrite: true },
        );
        await storage.setItem(projectKey(snapshot.id), {
          format: "mewvis-film-project-index",
          id: snapshot.id,
          workspaceId: snapshot.workspace.id,
        });
      });
    },
    async view(project: FilmProject) {
      return resumeView(
        project,
        await storage.getItem(`film:view:${project.id}`),
      );
    },
    saveView(id: string, view: FilmView) {
      const snapshot = { ...view };
      return serialize(() => storage.setItem(`film:view:${id}`, snapshot));
    },
    remove(id: string) {
      return serialize(async () => {
        await storage.removeItem(projectKey(id));
        await storage.removeItem(`film:view:${id}`);
      });
    },
  };
}
