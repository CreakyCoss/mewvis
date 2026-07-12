import { DefaultResourceLoader, getAgentDir, loadSkillsFromDir, type Skill } from "@earendil-works/pi-coding-agent";
import { resolveBuiltins, type ResolvedBuiltins } from "../../../../../../builtins/index.js";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import { runtimeResourcesFor, runtimeSkillSourcePaths } from "../../resources.js";
import { registerPiAskUserTool } from "../tools/ask-user-tool.js";
import { registerPiBuiltinTool } from "../tools/builtin-tool.js";

export const createPiResourceLoader = async (command: RuntimeAgentCommand, callbacks: AgentRuntimeCallbacks) => {
  const enabledSkills = runtimeResourcesFor(command).skills?.enabled ?? [];
  const builtins = resolveBuiltins(enabledSkills);
  const skills = loadPiSkills(command, builtins);
  const loader = new DefaultResourceLoader({
    cwd: command.workspacePath,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    extensionFactories: [
      (pi) => {
        registerPiAskUserTool(pi, command.taskId, callbacks.requestUserInput);
        for (const tool of builtins.requiredTools.internal) {
          registerPiBuiltinTool(pi, tool, { workspacePath: command.workspacePath });
        }
      },
    ],
    skillsOverride: () => ({
      skills,
      diagnostics: [],
    }),
  });

  await loader.reload();
  return loader;
};

const loadPiSkills = (command: RuntimeAgentCommand, builtins: ResolvedBuiltins): Skill[] => {
  const enabledNames = new Set(builtins.skillNames);
  if (enabledNames.size === 0) {
    return [];
  }

  const builtinSkills = builtins.sourcePaths.flatMap(
    (dir) =>
      loadSkillsFromDir({
        dir,
        source: "runtime-builtin",
      }).skills,
  );
  const reservedNames = builtins.reservedSkillNames;
  const loadedBuiltinNames = new Set(builtinSkills.map((skill) => skill.name));
  const missingBuiltinNames = builtins.internalSkillNames.filter((name) => !loadedBuiltinNames.has(name));
  if (missingBuiltinNames.length > 0) {
    throw new Error(`内置技能包不完整：${missingBuiltinNames.join(", ")}`);
  }

  const externalSkills = runtimeSkillSourcePaths(command).flatMap(
    (dir) =>
      loadSkillsFromDir({
        dir,
        source: "runtime",
      }).skills,
  );

  return [
    ...builtinSkills.filter((skill) => enabledNames.has(skill.name)),
    ...externalSkills.filter((skill) => enabledNames.has(skill.name) && !reservedNames.has(skill.name)),
  ];
};
