import type {
  ApplicationStorage,
  ApplicationStorageValue,
} from "@mewvis/app-sdk/data";
import { validateProject, type FilmProject } from "./model";
import { resumeView, type FilmView } from "./view-state";

const prefix = "film:project:";
export const projectKey = (id: string) => prefix + id;
export function createRepository(storage: ApplicationStorage) {
  let writes: Promise<void> = Promise.resolve();
  const serialize = (write: () => Promise<void>) => {
    const result = writes.catch(() => {}).then(write);
    writes = result;
    return result;
  };
  return {
    async list(): Promise<FilmProject[]> {
      const keys = (await storage.keys()).filter((key) =>
        key.startsWith(prefix),
      );
      const projects: FilmProject[] = [];
      for (const key of keys) {
        const project = validateProject(await storage.getItem(key));
        if (key !== projectKey(project.id))
          throw new Error("影视项目标识与存储键不一致");
        projects.push(project);
      }
      return projects.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    save(project: FilmProject) {
      const snapshot = validateProject(project);
      return serialize(() =>
        storage.setItem(
          projectKey(snapshot.id),
          snapshot as unknown as ApplicationStorageValue,
        ),
      );
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
