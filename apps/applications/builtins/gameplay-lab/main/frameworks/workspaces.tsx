import type { ComponentType } from "react";
import type { AnyProject } from "../app/projects/model";
import {
  isDoudizhuProject,
  isNarrativeProject,
  isTurnProject,
} from "../app/projects/model";
import NumericWorkspace from "../app/workspaces/NumericWorkspace";
import NarrativeWorkspace from "./branching-story/Workspace";
import type { FrameworkId } from "./contracts";
import DoudizhuWorkspace from "./doudizhu/Workspace";
export interface FrameworkWorkspaceProps {
  initialProject: AnyProject;
  onExit(): void;
}
const numeric: ComponentType<FrameworkWorkspaceProps> = (props) =>
  isTurnProject(props.initialProject) ? (
    <NumericWorkspace
      initialProject={props.initialProject}
      onExit={props.onExit}
    />
  ) : null;
const story: ComponentType<FrameworkWorkspaceProps> = (props) =>
  isNarrativeProject(props.initialProject) ? (
    <NarrativeWorkspace
      initialProject={props.initialProject}
      onExit={props.onExit}
    />
  ) : null;
const landlord: ComponentType<FrameworkWorkspaceProps> = (props) =>
  isDoudizhuProject(props.initialProject) ? (
    <DoudizhuWorkspace
      initialProject={props.initialProject}
      onExit={props.onExit}
    />
  ) : null;
const workspaces: Record<
  FrameworkId,
  ComponentType<FrameworkWorkspaceProps>
> = {
  "card-scoring": numeric,
  "resource-development": numeric,
  "branching-story": story,
  doudizhu: landlord,
};
export const frameworkWorkspace = (project: AnyProject) =>
  project.direction
    ? workspaces[project.direction]
    : isNarrativeProject(project)
      ? story
      : numeric;
