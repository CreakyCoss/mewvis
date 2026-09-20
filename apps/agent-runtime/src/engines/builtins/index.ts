import { uniq } from "lodash-es";
import { assertBuiltinDefinition, type BuiltinDefinition, type BuiltinToolDefinition } from "./definition.js";

const builtinRegistry = Object.freeze([] as BuiltinDefinition[]);

const builtinInternalSkillNames = new Set<string>(builtinRegistry.flatMap((builtin) => builtin.skill.skills.names));
const builtinPrivateToolNames = new Set<string>(
  builtinRegistry.flatMap((builtin) => builtin.tools.map((tool) => tool.name)),
);

export const isBuiltinPrivateToolName = (name: string) => builtinPrivateToolNames.has(name);

export type ResolvedBuiltins = {
  skillNames: string[];
  internalSkillNames: string[];
  sourcePaths: string[];
  reservedSkillNames: Set<string>;
  requiredTools: {
    internal: BuiltinToolDefinition[];
    external: string[];
  };
};

export const resolveBuiltins = (enabledSkills: readonly string[]): ResolvedBuiltins => {
  const enabled = new Set(enabledSkills);
  const active = builtinRegistry.filter((builtin) => enabled.has(builtin.skill.referenceName));

  for (const builtin of active) assertBuiltinDefinition(builtin);

  const internalSkillNames = uniq(active.flatMap((builtin) => builtin.skill.skills.names));
  const internalTools = new Map<string, BuiltinToolDefinition>();
  for (const builtin of active) {
    for (const tool of builtin.tools) internalTools.set(tool.name, tool);
  }

  return {
    skillNames: uniq([...enabledSkills, ...internalSkillNames]),
    internalSkillNames,
    sourcePaths: active.map((builtin) => builtin.skill.skills.resolveSourcePath()),
    reservedSkillNames: new Set(builtinInternalSkillNames),
    requiredTools: {
      internal: [...internalTools.values()],
      external: uniq(active.flatMap((builtin) => builtin.skill.requiredExternalTools)),
    },
  };
};
