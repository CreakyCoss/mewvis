import { validateNarrative } from "../narrative/validation";
import { isSimulatorRef } from "../shared/contracts";
import { copy } from "../shared/utils";
import { validateModel } from "../turn/model";
import { directionDefinition, isDirection, isGameType } from "./catalog";
import { isTemplateId } from "./examples";
import type {
  AnyProject,
  DesignBrief,
  DesignModel,
  Project,
  Version,
} from "./model";
import { normalize } from "./paths";

export const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const validBrief = (value: unknown): value is DesignBrief =>
  object(value) &&
  ["coreLoop", "question"].every(
    (key) =>
      typeof value[key] === "string" && String(value[key]).length <= 4000,
  );
export const validateDesign = (model: unknown, draft = false) =>
  (model as { format?: string })?.format === "gameplay-narrative-v1"
    ? validateNarrative(model, draft)
    : validateModel(model, draft);
function typed(value: Record<string, unknown>, model: unknown) {
  if (
    !object(model) ||
    !isGameType(value.gameType) ||
    !(value.direction === null || isDirection(value.direction)) ||
    !(value.simulator === null || isSimulatorRef(value.simulator)) ||
    !validBrief(value.brief)
  )
    return false;
  const format =
    value.gameType === "card"
      ? "gameplay-card-v1"
      : value.gameType === "narrative"
        ? "gameplay-narrative-v1"
        : "gameplay-model-v1";
  return (
    model.format === format &&
    (value.direction === null ||
      directionDefinition(value.direction)?.gameType === value.gameType)
  );
}
function validateVersions(value: unknown): value is Version<DesignModel>[] {
  if (!Array.isArray(value) || value.length > 10) return false;
  const ids = new Set<string>();
  return value.every((version) => {
    if (
      !object(version) ||
      !identifier(version.id) ||
      ids.has(version.id) ||
      typeof version.name !== "string" ||
      typeof version.createdAt !== "string" ||
      !typed(version, version.model) ||
      validateDesign(version.model).length
    )
      return false;
    ids.add(version.id);
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
  if (
    metadata.format !== "gameplay-project-v4" ||
    !identifier(metadata.id) ||
    !(metadata.exampleId === null || isTemplateId(metadata.exampleId)) ||
    typeof metadata.createdAt !== "string" ||
    !typed(metadata, model) ||
    !validateVersions(metadata.versions) ||
    validateDesign(model, true).length
  )
    throw new Error("项目 JSON 无法读取，或项目类型与模型不一致。");
  const story = model.format === "gameplay-narrative-v1";
  if (
    (story && metadata.exampleId !== null) ||
    metadata.versions.some(
      (v) => (v.model.format === "gameplay-narrative-v1") !== story,
    )
  )
    throw new Error("项目类型、玩法方向与策划模型不一致。");
  return {
    id: metadata.id,
    workspaceId: location.workspaceId,
    path: normalize(location.path),
    gameType: metadata.gameType,
    direction: metadata.direction,
    simulator: metadata.simulator,
    brief: metadata.brief,
    exampleId: metadata.exampleId,
    createdAt: metadata.createdAt,
    model,
    versions: metadata.versions,
  } as unknown as AnyProject;
}
export function projectDocument<M extends DesignModel>(project: Project<M>) {
  const document = {
    ...copy(project.model),
    project: {
      format: "gameplay-project-v4",
      id: project.id,
      gameType: project.gameType,
      direction: project.direction,
      simulator: copy(project.simulator),
      brief: copy(project.brief),
      exampleId: project.exampleId,
      createdAt: project.createdAt,
      versions: copy(project.versions),
    },
  };
  parseProjectDocument(document, project);
  return document;
}
