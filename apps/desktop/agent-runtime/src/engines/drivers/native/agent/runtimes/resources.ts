import { uniq } from "lodash-es";
import type { AgentRuntimeResources } from "../../../../protocol/index.js";
import type { AgentRunCommand } from "./types.js";

type RuntimeResourceCommand = Pick<AgentRunCommand, "resources">;

export const runtimeResourcesFor = (command: RuntimeResourceCommand): AgentRuntimeResources => ({
  ...(command.resources ?? {}),
  tools: {
    ...(command.resources?.tools ?? {}),
    allowed: command.resources?.tools?.allowed ?? null,
  },
  skills: {
    ...(command.resources?.skills ?? {}),
    bundledPath: command.resources?.skills?.bundledPath ?? null,
    paths: command.resources?.skills?.paths ?? null,
    enabled: command.resources?.skills?.enabled ?? null,
  },
});

export const allowedRuntimeTools = (command: RuntimeResourceCommand) =>
  runtimeResourcesFor(command).tools?.allowed ?? undefined;

export const enabledRuntimeSkillNames = (command: RuntimeResourceCommand) =>
  runtimeResourcesFor(command).skills?.enabled ?? [];

export const runtimeSkillSourcePaths = (command: RuntimeResourceCommand) => {
  const skills = runtimeResourcesFor(command).skills;
  const bundledPath = skills?.bundledPath;
  const paths = [
    ...(Array.isArray(bundledPath) ? bundledPath : bundledPath ? [bundledPath] : []),
    ...(skills?.paths ?? []),
  ];

  return uniq(paths.filter(Boolean));
};
