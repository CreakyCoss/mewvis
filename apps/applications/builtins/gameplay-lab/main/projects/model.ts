import type { NarrativeModel } from "../narrative/model";
import type { SimulatorRef } from "../shared/contracts";
import type { Model } from "../turn/model";
import type { DirectionId, GameTypeId } from "./catalog";
import type { TemplateId } from "./examples";
export interface DesignBrief {
  coreLoop: string;
  question: string;
}
export const emptyBrief = (): DesignBrief => ({ coreLoop: "", question: "" });
export type DesignModel = Model | NarrativeModel;
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
