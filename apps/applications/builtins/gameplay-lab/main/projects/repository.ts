import {
  getApplicationDataClient,
  type ApplicationDataClient,
  type ApplicationStorageValue,
} from "@mewvis/app-sdk/data";
import {
  getApplicationFileClient,
  type ApplicationFileClient,
} from "@mewvis/app-sdk/files";
import { blankCardModel } from "../card/model";
import { blankNarrative } from "../narrative/model";
import { isSimulatorRef, type SimulatorRef } from "../shared/contracts";
import { copy, uid } from "../shared/utils";
import { blankModel, exampleSimulator } from "../turn/simulators";
import {
  directionDefinition,
  directionForSimulator,
  isDirection,
  isGameType,
  type DirectionId,
  type GameTypeId,
} from "./catalog";
import { exampleModel, isTemplateId, type TemplateId } from "./examples";

import {
  identifier,
  object,
  parseProjectDocument,
  projectDocument,
} from "./document";
import {
  IncompatibleDataError,
  readSnapshot,
  verifySnapshot,
  type FileSnapshot,
  type IncompatibleData,
} from "./incompatible";
import {
  emptyBrief,
  initialWorkspace,
  type AnyProject,
  type DesignModel,
  type Project,
  type Workspace,
} from "./model";
import { normalize, projectDirectory, projectFile } from "./paths";
export const LIBRARY_KEY = "gameplay-lab:library:v2";
export const OBSOLETE_WORKSPACE_KEY = "gameplay-lab:workspace:v1";
const json = (value: unknown) => {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024)
    throw new Error(
      "策划文件超过 4 MiB，原文件已保留。请减少内容或命名版本数量。",
    );
  return text;
};
interface ProjectReference {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
}
type Files = Pick<
  ApplicationFileClient,
  "mkdir" | "stat" | "readText" | "writeText" | "remove"
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
  const incompatibleProjects = new Map<
    string,
    { item: IncompatibleData; workspaceId: string; snapshot: FileSnapshot }
  >();
  const incompatibleStorage = new Map<
    string,
    { item: IncompatibleData; value: ApplicationStorageValue }
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
  async function addReference(project: Project<DesignModel>) {
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
  async function read(
    workspaceId: string,
    expectedId?: string,
  ): Promise<AnyProject> {
    const workspace = await data.workspaces.get(workspaceId);
    const path = projectFile(workspace.path);
    const snapshot = await readSnapshot(files, path, 4 * 1024 * 1024);
    const { text, modifiedAt } = snapshot;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = undefined;
    }
    if (
      object(value) &&
      object(value.project) &&
      expectedId &&
      value.project.id !== expectedId
    ) {
      if (identifier(value.project.id))
        cache.set(workspaceId, {
          id: value.project.id,
          text,
          modifiedAt,
        });
      else cache.delete(workspaceId);
      throw new Error("项目标识已变化，请从项目库重新打开。");
    }
    let project: AnyProject;
    try {
      project = parseProjectDocument(value, {
        workspaceId,
        path: workspace.path,
      });
    } catch (error) {
      cache.delete(workspaceId);
      const item: IncompatibleData = {
        id: uid("incompatible"),
        name: workspace.name,
        path: normalize(workspace.path),
        reason: `项目文件或命名版本无法读取：${error instanceof Error ? error.message : String(error)}`,
        consequence: "将永久删除整个项目目录及其中的所有文件，并移除项目登记。",
      };
      incompatibleProjects.set(item.id, { item, workspaceId, snapshot });
      throw new IncompatibleDataError(item);
    }
    cache.set(workspaceId, {
      id: project.id,
      text: json(projectDocument(project)),
      modifiedAt,
    });
    return project;
  }
  async function save(project: Project<DesignModel>) {
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
    list(): Promise<Workspace<DesignModel>> {
      return serialize(async () => {
        const state = initialWorkspace<DesignModel>(),
          records = await references();
        const oldStorage = await data.storage.getItem(OBSOLETE_WORKSPACE_KEY);
        if (oldStorage !== null) {
          const item: IncompatibleData = {
            id: uid("incompatible"),
            name: "不兼容的数据库项目",
            path: OBSOLETE_WORKSPACE_KEY,
            reason: "此数据格式无法由当前应用读取。",
            consequence:
              "将永久删除这份数据库项目数据，目录项目及其文件会保留。",
          };
          incompatibleStorage.set(item.id, { item, value: copy(oldStorage) });
          state.incompatible.push(item);
        }
        for (const reference of records) {
          try {
            const project = await read(reference.workspaceId, reference.id);
            state.projects.push(project);
          } catch (error) {
            if (error instanceof IncompatibleDataError)
              state.incompatible.push({ ...error.item, name: reference.name });
            else
              state.errors.push(
                `${reference.name}（${reference.path}）：${error instanceof Error ? error.message : String(error)}`,
              );
          }
        }
        return state;
      });
    },
    deleteIncompatible(id: string) {
      return serialize(async () => {
        const stored = incompatibleStorage.get(id);
        if (stored) {
          if (
            JSON.stringify(
              await data.storage.getItem(OBSOLETE_WORKSPACE_KEY),
            ) !== JSON.stringify(stored.value)
          )
            throw new Error("数据已变化，请重新加载后再次确认删除。");
          await data.storage.removeItem(OBSOLETE_WORKSPACE_KEY);
          incompatibleStorage.delete(id);
          return;
        }
        const candidate = incompatibleProjects.get(id);
        if (!candidate)
          throw new Error("待删除项目已变化，请重新加载后再次确认。");
        const workspace = await data.workspaces.get(candidate.workspaceId);
        if (normalize(workspace.path) !== candidate.item.path)
          throw new Error("项目目录已变化，请重新加载后再次确认。");
        await verifySnapshot(
          files,
          projectFile(workspace.path),
          candidate.snapshot,
        );
        const remaining = (await references()).filter(
          (reference) => reference.workspaceId !== workspace.id,
        );
        await data.workspaces.remove({ id: workspace.id, deleteContent: true });
        await data.storage.setItem(LIBRARY_KEY, {
          format: "gameplay-library-v2",
          projects: remaining,
        } as unknown as ApplicationStorageValue);
        cache.delete(workspace.id);
        incompatibleProjects.delete(id);
      });
    },
    saveProject(project: AnyProject) {
      const snapshot = copy(project);
      return serialize(() => save(snapshot));
    },
    flush: () => writes,
    selectDirectory: () => data.workspaces.selectDirectory(),
    create(input: {
      name: string;
      parent: string;
      gameType?: GameTypeId;
      direction?: DirectionId | null;
      source?: "blank" | "example";
      exampleId?: TemplateId;
      simulator?: SimulatorRef | null;
    }): Promise<AnyProject | null> {
      return serialize(async () => {
        const records = await references();
        if (records.length >= 20) throw new Error("首版最多保存 20 个项目。");
        const name = input.name.trim();
        if (!name || name.length > 60)
          throw new Error("请输入 1–60 字的项目名称。");
        const source = input.source ?? (input.exampleId ? "example" : "blank");
        if (!["blank", "example"].includes(source))
          throw new Error("请选择从零开始或从示例创建。");
        if (source === "example" && !isTemplateId(input.exampleId))
          throw new Error("请选择示例方案。");
        if (
          input.simulator !== undefined &&
          input.simulator !== null &&
          !isSimulatorRef(input.simulator)
        )
          throw new Error("模拟器选择格式无效。");
        const gameType =
          input.gameType ??
          (input.exampleId === "combination" ||
          input.simulator?.id === "card-combination"
            ? "card"
            : "systems");
        if (!isGameType(gameType)) throw new Error("请选择可用的游戏类型。");
        if (
          source === "example" &&
          (gameType === "narrative" ||
            (input.exampleId === "combination" ? "card" : "systems") !==
              gameType)
        )
          throw new Error("示例与游戏类型不兼容。");
        const simulator =
          input.simulator === undefined
            ? source === "example"
              ? exampleSimulator(input.exampleId!)
              : input.direction
                ? (directionDefinition(input.direction)?.simulator ?? null)
                : null
            : input.simulator;
        const direction =
          input.direction === undefined
            ? directionForSimulator(simulator)
            : input.direction;
        if (
          direction !== null &&
          (!isDirection(direction) ||
            directionDefinition(direction)?.gameType !== gameType)
        )
          throw new Error("玩法方向与游戏类型不兼容。");
        const directory = projectDirectory(input.parent, name);
        const workspace = await data.workspaces.create({
          name,
          path: directory,
          exclusive: true,
        });
        if (!workspace) return null;
        const model =
          source === "example"
            ? exampleModel(input.exampleId!)
            : gameType === "narrative"
              ? blankNarrative(name)
              : gameType === "card"
                ? blankCardModel(name)
                : blankModel(name);
        model.id = uid("model");
        model.name = name;
        const project = {
          gameType,
          direction,
          id: uid("project"),
          workspaceId: workspace.id,
          path: normalize(workspace.path),
          exampleId: source === "example" ? input.exampleId! : null,
          simulator: copy(simulator),
          brief: emptyBrief(),
          createdAt: new Date().toISOString(),
          model,
          versions: [],
        } as AnyProject;
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
    open(path?: string): Promise<AnyProject | null> {
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
    reload(project: Project<DesignModel>) {
      return serialize(async () => {
        const value = await read(project.workspaceId, project.id);
        if (value.id !== project.id)
          throw new Error("项目标识已变化，请从项目库重新打开。");
        return value;
      });
    },
    reset(
      project: Project,
      exampleId: TemplateId,
    ): Promise<{ project: Project; backup: string }> {
      const snapshot = copy(project);
      return serialize(async () => {
        if (!isTemplateId(exampleId)) throw new Error("请选择内置示例。");
        await save(snapshot);
        // Back up the actual file after checking for external edits, before replacement.
        const actual = await read(snapshot.workspaceId, snapshot.id);
        if (json(projectDocument(actual)) !== json(projectDocument(snapshot))) {
          cache.delete(snapshot.workspaceId);
          throw new Error(
            "项目文件已在外部修改，请重新读取后再切换模板或重置。",
          );
        }
        const backup = `${snapshot.path}/backups/${new Date().toISOString().replaceAll(":", "-")}-${uid("rules")}.json`;
        await files.mkdir(`${snapshot.path}/backups`);
        await files.writeText(backup, json(projectDocument(snapshot)));
        const model = exampleModel(exampleId);
        model.id = snapshot.model.id;
        model.name = snapshot.model.name;
        const next = {
          ...snapshot,
          model,
          exampleId,
          gameType:
            exampleId === "combination"
              ? ("card" as const)
              : ("systems" as const),
          direction:
            exampleId === "combination"
              ? ("card-scoring" as const)
              : ("resource-development" as const),
          simulator: exampleSimulator(exampleId),
        };
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
      remove: (...args) => getApplicationFileClient().remove(...args),
      stat: (...args) => getApplicationFileClient().stat(...args),
      readText: (...args) => getApplicationFileClient().readText(...args),
      writeText: (...args) => getApplicationFileClient().writeText(...args),
    },
  ));
}
