import { uniq } from "lodash-es";
import { BUILTIN_COMBINATIONS } from "./index.js";
import type { BuiltinToolDefinition } from "./types.js";

const builtinInternalSkillNames = new Set<string>(
  BUILTIN_COMBINATIONS.flatMap((combination) => combination.skill.skills.names),
);
const builtinPrivateToolNames = new Set<string>(
  BUILTIN_COMBINATIONS.flatMap((combination) => combination.tools.map((tool) => tool.name)),
);

export const isBuiltinPrivateToolName = (name: string) => builtinPrivateToolNames.has(name);

export type ResolvedBuiltinCombinations = {
  skillNames: string[];
  internalSkillNames: string[];
  sourcePaths: string[];
  reservedSkillNames: Set<string>;
  requiredTools: {
    internal: BuiltinToolDefinition[];
    external: string[];
  };
};

export const resolveBuiltinCombinations = (enabledSkills: readonly string[]): ResolvedBuiltinCombinations => {
  const enabled = new Set(enabledSkills);
  const active = BUILTIN_COMBINATIONS.filter((combination) => enabled.has(combination.skill.referenceName));

  for (const combination of active) {
    const providedCapabilities = new Set<string>(combination.tools.flatMap((tool) => tool.capabilities));
    const missingCapabilities = combination.skill.requiredToolCapabilities.filter(
      (capability) => !providedCapabilities.has(capability),
    );
    if (missingCapabilities.length > 0) {
      throw new Error(`内置技能 ${combination.skill.id} 缺少兼容工具能力：${missingCapabilities.join(", ")}`);
    }
  }

  const internalSkillNames = uniq(active.flatMap((combination) => combination.skill.skills.names));
  const internalTools = new Map<string, BuiltinToolDefinition>(
    active.flatMap((combination) => combination.tools).map((tool) => [tool.name, tool]),
  );

  return {
    skillNames: uniq([...enabledSkills, ...internalSkillNames]),
    internalSkillNames,
    sourcePaths: active.map((combination) => combination.skill.skills.resolveSourcePath()),
    reservedSkillNames: new Set(builtinInternalSkillNames),
    requiredTools: {
      internal: [...internalTools.values()],
      external: uniq(active.flatMap((combination) => combination.skill.requiredExternalTools)),
    },
  };
};
