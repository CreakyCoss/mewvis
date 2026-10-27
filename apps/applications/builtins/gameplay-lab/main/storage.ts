import {
  getApplicationDataClient,
  type ApplicationStorageValue,
} from "@mewvis/app-sdk/data";
import { makeTemplate } from "./fixtures";
import { validateModel, type Model } from "./model";

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
}
export interface Workspace {
  format: "gameplay-workspace-v1";
  active: string;
  projects: Project[];
}
const key = "gameplay-lab:workspace:v1";
export function initialWorkspace(): Workspace {
  return {
    format: "gameplay-workspace-v1",
    active: "project-development",
    projects: [
      {
        id: "project-development",
        model: makeTemplate("development"),
        versions: [],
      },
      {
        id: "project-combination",
        model: makeTemplate("combination"),
        versions: [],
      },
    ],
  };
}
export function parseWorkspace(value: unknown): Workspace {
  const data = value as Workspace;
  if (
    !data ||
    data.format !== "gameplay-workspace-v1" ||
    !Array.isArray(data.projects) ||
    !data.projects.length ||
    data.projects.length > 20 ||
    !data.projects.some((p) => p?.id === data.active)
  )
    throw new Error("项目数据格式不完整，原数据已保留。");
  const ids = new Set<string>();
  for (const p of data.projects) {
    if (
      !p ||
      typeof p.id !== "string" ||
      ids.has(p.id) ||
      validateModel(p.model, true).length ||
      !Array.isArray(p.versions) ||
      p.versions.length > 10
    )
      throw new Error("项目模型或版本记录无法读取，原数据已保留。");
    ids.add(p.id);
    for (const v of p.versions)
      if (
        !v ||
        typeof v.id !== "string" ||
        typeof v.name !== "string" ||
        typeof v.createdAt !== "string" ||
        validateModel(v.model).length
      )
        throw new Error("历史版本格式不完整。");
  }
  return data;
}
export async function loadWorkspace() {
  const data = await getApplicationDataClient().storage.getItem(key);
  return data === null ? initialWorkspace() : parseWorkspace(data);
}
let queue: Promise<unknown> = Promise.resolve();
export function saveWorkspace(data: Workspace) {
  const snapshot = structuredClone(data);
  const job = queue
    .catch(() => {})
    .then(() =>
      getApplicationDataClient().storage.setItem(
        key,
        snapshot as unknown as ApplicationStorageValue,
      ),
    );
  queue = job;
  return job;
}
