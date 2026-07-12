import { uniq } from "lodash-es";
import type { AgentRuntimeResources } from "../../../../protocol/index.js";
import { isBuiltinPrivateToolName, resolveBuiltins } from "../../../../builtins/index.js";
import { DEFAULT_ALLOWED_AGENT_TOOLS } from "../tools/definitions.js";
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

export const allowedRuntimeTools = (command: RuntimeResourceCommand) => {
  const resources = runtimeResourcesFor(command);
  const configured = resources.tools?.allowed ?? undefined;
  const builtin = resolveBuiltins(resources.skills?.enabled ?? []);
  if (builtin.requiredTools.internal.length === 0 && builtin.requiredTools.external.length === 0) {
    return configured?.filter((name) => !isBuiltinPrivateToolName(name));
  }
  const publicTools = (configured ?? DEFAULT_ALLOWED_AGENT_TOOLS).filter((name) => !isBuiltinPrivateToolName(name));
  return uniq([
    ...publicTools,
    ...builtin.requiredTools.external,
    ...builtin.requiredTools.internal.map((tool) => tool.name),
  ]);
};

export const runtimeSkillSourcePaths = (command: RuntimeResourceCommand) => {
  const skills = runtimeResourcesFor(command).skills;
  const bundledPath = skills?.bundledPath;
  const paths = [
    ...(Array.isArray(bundledPath) ? bundledPath : bundledPath ? [bundledPath] : []),
    ...(skills?.paths ?? []),
  ];

  return uniq(paths.filter(Boolean));
};
