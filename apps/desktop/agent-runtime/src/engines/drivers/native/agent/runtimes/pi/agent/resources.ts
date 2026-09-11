import {
  DefaultResourceLoader,
  SettingsManager,
  getAgentDir,
  loadSkillsFromDir,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { ResolvedBuiltins } from "../../../../../../builtins/index.js";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import { runtimeSkillSourcePaths } from "../../resources.js";
import { createPiToolSet } from "../tools/index.js";
import type { PiAgentSessionOptions } from "./session.js";
import { accessAllowsPath, type ResolvedAgentAccess } from "../../../../../../../security/access/index.js";

export const createPiResourceLoader = async (
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  options: PiAgentSessionOptions = {},
) => {
  const toolSet = await createPiToolSet(command, callbacks, options);
  try {
    const skills = loadPiSkills(command, toolSet.builtins, toolSet.plugins?.skills ?? [], toolSet.access);
    const settingsManager = toolSet.access ? SettingsManager.inMemory() : undefined;
    const loader = new DefaultResourceLoader({
      cwd: command.workspacePath,
      agentDir: getAgentDir(),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      // Scoped runs must not auto-inject unrelated home/ancestor instructions or templates.
      ...(toolSet.access
        ? { noContextFiles: true, noPromptTemplates: true, noThemes: true, systemPrompt: "", appendSystemPrompt: [] }
        : {}),
      ...(options.rolePrompt ? { systemPromptOverride: () => options.rolePrompt } : {}),
      extensionFactories: [
        (pi) => {
          for (const tool of toolSet.tools) pi.registerTool(tool);
          toolSet.registerExtensions(pi);
          toolSet.plugins?.registerSkills(pi, skills);
        },
      ],
      skillsOverride: () => ({ skills, diagnostics: [] }),
    });
    await loader.reload();
    return {
      loader,
      settingsManager,
      toolNames: toolSet.tools.map((tool) => tool.name),
      dispose: toolSet.dispose,
      installSafety: toolSet.installSafety,
    };
  } catch (error) {
    await toolSet.dispose();
    throw error;
  }
};

const loadPiSkills = (
  command: RuntimeAgentCommand,
  builtins: ResolvedBuiltins,
  pluginSkills: readonly Skill[],
  access?: ResolvedAgentAccess,
): Skill[] => {
  const enabledNames = new Set(builtins.skillNames);
  if (enabledNames.size === 0 && pluginSkills.length === 0) {
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

  const externalSkills = runtimeSkillSourcePaths(command)
    .filter((dir) => !access || accessAllowsPath(access.filesystem.read, dir))
    .flatMap(
      (dir) =>
        loadSkillsFromDir({
          dir,
          source: "runtime",
        }).skills,
    );

  const resolved = [
    ...builtinSkills.filter((skill) => enabledNames.has(skill.name)),
    ...externalSkills.filter(
      (skill) =>
        enabledNames.has(skill.name) &&
        !reservedNames.has(skill.name) &&
        (!access || accessAllowsPath(access.filesystem.read, skill.filePath)),
    ),
  ];
  const resolvedNames = new Set(resolved.map((skill) => skill.name));
  return [
    ...resolved,
    ...pluginSkills.filter(
      (skill) => !skill.disableModelInvocation && !reservedNames.has(skill.name) && !resolvedNames.has(skill.name),
    ),
  ];
};
