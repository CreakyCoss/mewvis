import { validateNarrative } from "../narrative/validation";
import { isSimulatorRef, type SimulatorRef } from "../shared/contracts";
import { copy } from "../shared/utils";
import { validateModel, type Model } from "../turn/model";
import { inferLegacySimulator } from "../turn/simulators";
import {
  directionDefinition,
  directionForSimulator,
  isDirection,
  isGameType,
  type DirectionId,
  type GameTypeId,
} from "./catalog";
import { isTemplateId, type TemplateId } from "./examples";
import {
  emptyBrief,
  type AnyProject,
  type DesignBrief,
  type DesignModel,
  type Project,
  type Version,
} from "./model";
import { normalize } from "./paths";
const validBrief = (v: unknown): v is DesignBrief =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  ["coreLoop", "question"].every(
    (key) =>
      typeof (v as Record<string, unknown>)[key] === "string" &&
      String((v as Record<string, unknown>)[key]).length <= 4000,
  );
export const validateDesign = (model: unknown, draft = false) =>
  (model as { format?: string })?.format === "gameplay-narrative-v1"
    ? validateNarrative(model, draft)
    : validateModel(model, draft);
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
export const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const identifier = (value: unknown): value is string =>
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
