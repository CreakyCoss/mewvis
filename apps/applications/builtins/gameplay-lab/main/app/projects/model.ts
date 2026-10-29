import type { Model } from "../../domains/turn/model";
import type { NarrativeModel } from "../../frameworks/branching-story/model";
import type { FrameworkId, GameTypeId } from "../../frameworks/catalog";
import type { DoudizhuModel } from "../../frameworks/doudizhu/model";
import type { SimulatorRef } from "../../shared/contracts";
import type { TemplateId } from "./examples";
import type { IncompatibleData } from "./incompatible";
export interface DesignBrief {
  coreLoop: string;
  question: string;
}
export const emptyBrief = (): DesignBrief => ({ coreLoop: "", question: "" });
export type DesignModel = Model | NarrativeModel | DoudizhuModel;
export const isDoudizhuProject = (p: AnyProject): p is Project<DoudizhuModel> =>
  p.model.format === "gameplay-doudizhu-v1";
export interface Version<M extends DesignModel = Model> {
  gameType: GameTypeId;
  direction: FrameworkId | null;
  simulator: SimulatorRef | null;
  brief: DesignBrief;
  id: string;
  name: string;
  model: M;
  createdAt: string;
}
export interface Project<M extends DesignModel = Model> {
  gameType: GameTypeId;
  direction: FrameworkId | null;
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
  p.model.format === "gameplay-model-v1" ||
  p.model.format === "gameplay-card-v1";
export interface Workspace<M extends DesignModel = Model> {
  format: "gameplay-workspace-v2";
  active: string;
  projects: Project<M>[];
  errors: string[];
  incompatible: IncompatibleData[];
}
export function initialWorkspace<
  M extends DesignModel = Model,
>(): Workspace<M> {
  return {
    format: "gameplay-workspace-v2",
    active: "",
    projects: [],
    errors: [],
    incompatible: [],
  };
}
