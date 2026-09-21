import { piExtensionAdapter, installPiExtensionGuards } from "../extensions/index.js";
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
import type { PiAgentSession, PiAgentSessionOptions } from "./session.js";
import { accessAllowsPath, type ResolvedAgentAccess } from "../../../../../../../security/access/index.js";

export const createPiResourceLoader = async (
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  options: PiAgentSessionOptions = {},
) => {
  const toolSet = await createPiToolSet(command, callbacks, options);
  try {
    const extensionTools = options.extensions?.catalog.tools ?? [];
    const allTools = [...toolSet.tools, ...extensionTools];
    if (new Set(allTools.map((tool) => tool.name)).size !== allTools.length)
      throw new Error("插件工具与已有工具名称冲突");
    const skills = loadPiSkills(command, toolSet.builtins, toolSet.applications?.skills ?? [], toolSet.access);
    const settingsManager = toolSet.access ? SettingsManager.inMemory() : undefined;
    const extension =
      options.extensions &&
      piExtensionAdapter.adapt(options.extensions, {
        taskId: command.taskId,
        runtimeId: "pi",
        signal: options.signal,
      });
    const loader = new DefaultResourceLoader({
      cwd: command.workspacePath,
      agentDir: getAgentDir(),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      // Scoped runs must not auto-inject unrelated home/ancestor instructions or templates.
      ...(toolSet.access
        ? {
            noContextFiles: true,
            noPromptTemplates: true,
            noThemes: true,
            systemPrompt: "",
            appendSystemPrompt: [],
          }
        : {}),
      ...(options.rolePrompt ? { systemPromptOverride: () => options.rolePrompt } : {}),
      extensionFactories: [
        (pi) => {
          for (const tool of toolSet.tools) pi.registerTool(tool);
          toolSet.registerExtensions(pi);
          toolSet.applications?.registerSkills(pi, skills);
        },
        ...(extension ? [extension] : []),
      ],
      skillsOverride: () => ({ skills, diagnostics: [] }),
    });
    await loader.reload();
    return {
      loader,
      settingsManager,
      toolNames: allTools.map((tool) => tool.name),
      dispose: toolSet.dispose,
      installSafety(session: PiAgentSession) {
        toolSet.installSafety(session);
        if (extension) installPiExtensionGuards(session, extension.assertHealthy);
      },
    };
  } catch (error) {
    await toolSet.dispose();
    throw error;
  }
};

const loadPiSkills = (
  command: RuntimeAgentCommand,
  builtins: ResolvedBuiltins,
  applicationSkills: readonly Skill[],
  access?: ResolvedAgentAccess,
): Skill[] => {
  const enabledNames = new Set(builtins.skillNames);
  if (enabledNames.size === 0 && applicationSkills.length === 0) {
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
    ...applicationSkills.filter(
      (skill) => !skill.disableModelInvocation && !reservedNames.has(skill.name) && !resolvedNames.has(skill.name),
    ),
  ];
};
