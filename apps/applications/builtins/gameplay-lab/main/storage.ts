import {
  blankNarrative,
  validateNarrative,
  type NarrativeModel,
} from "./narrative";
import {
  directionForSimulator,
  directionDefinition,
  isGameType,
  isDirection,
  type GameTypeId,
  type DirectionId,
} from "./catalog";
import {
  blankModel,
  exampleSimulator,
  inferLegacySimulator,
  isSimulatorRef,
  type SimulatorRef,
} from "./simulators";
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

export interface DesignBrief {
  coreLoop: string;
  question: string;
}
export const emptyBrief = (): DesignBrief => ({ coreLoop: "", question: "" });
const validBrief = (v: unknown): v is DesignBrief =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  ["coreLoop", "question"].every(
    (key) =>
      typeof (v as Record<string, unknown>)[key] === "string" &&
      String((v as Record<string, unknown>)[key]).length <= 4000,
  );
export type DesignModel = Model | NarrativeModel;
export const validateDesign = (model: unknown, draft = false) =>
  (model as { format?: string })?.format === "gameplay-narrative-v1"
    ? validateNarrative(model, draft)
    : validateModel(model, draft);
export interface Version<M extends DesignModel = Model> {
  gameType?: GameTypeId;
  direction?: DirectionId | null;
  simulator?: SimulatorRef | null;
  brief?: DesignBrief;
  id: string;
  name: string;
  model: M;
  createdAt: string;
}
export interface Project<M extends DesignModel = Model> {
  gameType: GameTypeId;
  direction: DirectionId | null;
  simulator: SimulatorRef | null;
  brief: DesignBrief;
  id: string;
  model: M;
  versions: Version<M>[];
  workspaceId: string;
  path: string;
  exampleId: TemplateId | null;
  createdAt: string;
}
export type AnyProject = Project<DesignModel>;
export const isNarrativeProject = (
  p: AnyProject,
): p is Project<NarrativeModel> => p.model.format === "gameplay-narrative-v1";
export const isTurnProject = (p: AnyProject): p is Project<Model> =>
  p.model.format === "gameplay-model-v1";
export interface Workspace<M extends DesignModel = Model> {
  format: "gameplay-workspace-v2";
  active: string;
  projects: Project<M>[];
  errors: string[];
}
interface ProjectReference {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
}
interface ProjectMetadata {
  format: "gameplay-project-v4";
  gameType: GameTypeId;
  direction: DirectionId | null;
  simulator: SimulatorRef | null;
  brief: DesignBrief;
  id: string;
  exampleId: TemplateId | null;
  createdAt: string;
  versions: Version<DesignModel>[];
}
export const LIBRARY_KEY = "gameplay-lab:library:v2";
export const OBSOLETE_WORKSPACE_KEY = "gameplay-lab:workspace:v1";
export const MODEL_FILE = "models/core.json";
const json = (value: unknown) => {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024)
    throw new Error(
      "策划文件超过 4 MiB，原文件已保留。请减少内容或命名版本数量。",
    );
  return text;
};
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
function validateVersions(value: unknown): value is Version<DesignModel>[] {
  if (!Array.isArray(value) || value.length > 10) return false;
  const ids = new Set<string>();
  return value.every((v) => {
    if (
      !object(v) ||
      !identifier(v.id) ||
      ids.has(v.id) ||
      typeof v.name !== "string" ||
      typeof v.createdAt !== "string" ||
      (v.simulator !== undefined &&
        v.simulator !== null &&
        !isSimulatorRef(v.simulator)) ||
      (v.brief !== undefined && !validBrief(v.brief)) ||
      (v.gameType !== undefined && !isGameType(v.gameType)) ||
      (v.direction !== undefined &&
        v.direction !== null &&
        !isDirection(v.direction)) ||
      (v.gameType !== undefined &&
        (v.gameType === "narrative") !==
          ((v.model as { format?: string })?.format ===
            "gameplay-narrative-v1")) ||
      (v.gameType !== undefined &&
        v.direction != null &&
        directionDefinition(v.direction as DirectionId)?.gameType !==
          v.gameType) ||
      validateDesign(v.model).length
    )
      return false;
    ids.add(v.id);
    return true;
  });
}
export function initialWorkspace<
  M extends DesignModel = Model,
>(): Workspace<M> {
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
): AnyProject {
  if (!object(value) || !object(value.project))
    throw new Error("项目 JSON 格式不完整。");
  const { project: metadata, ...model } = value;
  const legacy = metadata.format === "gameplay-project-v2";
  const typed = metadata.format === "gameplay-project-v4";
  const exampleId = legacy ? metadata.templateId : metadata.exampleId;
  if (
    (!legacy && !typed && metadata.format !== "gameplay-project-v3") ||
    (!legacy &&
      (!(metadata.simulator === null || isSimulatorRef(metadata.simulator)) ||
        !validBrief(metadata.brief))) ||
    (typed &&
      (!isGameType(metadata.gameType) ||
        !(metadata.direction === null || isDirection(metadata.direction)))) ||
    !identifier(metadata.id) ||
    !(exampleId === null || isTemplateId(exampleId)) ||
    typeof metadata.createdAt !== "string" ||
    !validateVersions(metadata.versions) ||
    validateDesign(model, true).length
  )
    throw new Error("项目 JSON 无法读取，原文件已保留。");
  const story = model.format === "gameplay-narrative-v1";
  if (story && !typed) throw new Error("叙事项目需要类型化的项目元数据。");
  const simulator = legacy
    ? inferLegacySimulator(model as unknown as Model)
    : (metadata.simulator as SimulatorRef | null);
  const gameType = typed
    ? (metadata.gameType as GameTypeId)
    : story
      ? "narrative"
      : exampleId === "combination" ||
          (model as unknown as Model).collections.length
        ? "card"
        : "systems";
  const direction = typed
    ? (metadata.direction as DirectionId | null)
    : simulator
      ? gameType === "card"
        ? "card-scoring"
        : gameType === "narrative"
          ? "branching-story"
          : "resource-development"
      : null;
  if (
    (gameType === "narrative") !== story ||
    (direction && directionDefinition(direction)?.gameType !== gameType) ||
    (story && exampleId !== null) ||
    metadata.versions.some(
      (v) => (v.model.format === "gameplay-narrative-v1") !== story,
    )
  )
    throw new Error("项目类型、玩法方向与策划模型不一致。");
  return {
    gameType,
    direction,
    id: metadata.id,
    simulator,
    brief: legacy ? emptyBrief() : (metadata.brief as DesignBrief),
    workspaceId: location.workspaceId,
    path: normalize(location.path),
    exampleId: exampleId as TemplateId | null,
    createdAt: metadata.createdAt,
    model: model as unknown as DesignModel,
    versions: metadata.versions.map((v) => ({
      ...v,
      simulator:
        v.simulator === undefined
          ? v.model.format === "gameplay-narrative-v1"
            ? { id: "branching-narrative", version: 1 }
            : inferLegacySimulator(v.model)
          : v.simulator,
      gameType:
        v.gameType ??
        (v.model.format === "gameplay-narrative-v1"
          ? "narrative"
          : v.model.collections.length
            ? "card"
            : "systems"),
      direction:
        v.direction === undefined
          ? directionForSimulator(
              v.simulator === undefined
                ? v.model.format === "gameplay-narrative-v1"
                  ? { id: "branching-narrative", version: 1 }
                  : inferLegacySimulator(v.model)
                : v.simulator,
            )
          : v.direction,
    })),
  } as AnyProject;
}
export function projectDocument<M extends DesignModel>(project: Project<M>) {
  const metadata: ProjectMetadata = {
    format: "gameplay-project-v4",
    gameType:
      project.gameType ??
      (project.model.format === "gameplay-narrative-v1"
        ? "narrative"
        : project.exampleId === "combination" ||
            project.model.collections.length
          ? "card"
          : "systems"),
    direction:
      project.direction === undefined
        ? directionForSimulator(project.simulator)
        : project.direction,
    simulator: copy(project.simulator),
    brief: copy(project.brief),
    id: project.id,
    exampleId: project.exampleId,
    createdAt: project.createdAt,
    versions: copy(project.versions).map((v) => ({
      ...v,
      simulator:
        v.simulator === undefined
          ? v.model.format === "gameplay-narrative-v1"
            ? { id: "branching-narrative", version: 1 }
            : inferLegacySimulator(v.model)
          : v.simulator,
      gameType:
        v.gameType ??
        (v.model.format === "gameplay-narrative-v1"
          ? "narrative"
          : v.model.collections.length
            ? "card"
            : "systems"),
      direction:
        v.direction === undefined
          ? directionForSimulator(
              v.simulator === undefined
                ? v.model.format === "gameplay-narrative-v1"
                  ? { id: "branching-narrative", version: 1 }
                  : inferLegacySimulator(v.model)
                : v.simulator,
            )
          : v.direction,
    })),
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
  async function read(workspaceId: string): Promise<AnyProject> {
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
    async list(): Promise<Workspace<DesignModel>> {
      await writes.catch(() => {});
      await data.storage.removeItem(OBSOLETE_WORKSPACE_KEY);
      const state = initialWorkspace<DesignModel>(),
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
    saveWorkspace(workspace: Workspace<DesignModel>) {
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
            ? makeTemplate(input.exampleId!)
            : gameType === "narrative"
              ? blankNarrative(name)
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
        const value = await read(project.workspaceId);
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
        const model = makeTemplate(exampleId);
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
      stat: (...args) => getApplicationFileClient().stat(...args),
      readText: (...args) => getApplicationFileClient().readText(...args),
      writeText: (...args) => getApplicationFileClient().writeText(...args),
    },
  ));
}
export const loadWorkspace = () => projectRepository().list();
export const saveWorkspace = (workspace: Workspace<DesignModel>) =>
  projectRepository().saveWorkspace(workspace);
