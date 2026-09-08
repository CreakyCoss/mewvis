import { DefaultResourceLoader, getAgentDir, loadSkillsFromDir, type Skill } from "@earendil-works/pi-coding-agent";
import { resolveBuiltins, type ResolvedBuiltins } from "../../../../../../builtins/index.js";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import { allowedRuntimeTools, runtimeResourcesFor, runtimeSkillSourcePaths } from "../../resources.js";
import { registerPiAskUserTool } from "../tools/ask-user-tool.js";
import { registerPiBuiltinTool } from "../tools/builtin-tool.js";
import { createPluginRuntimeBridge } from "../plugins/bridge.js";
import { AGENT_TOOL_DEFINITIONS, normalizeAllowedAgentTools } from "../../../tools/definitions.js";
import { loadPiSandboxConfig, registerPiSandbox } from "../tools/sandbox.js";
import { registerPiSubagentTool } from "../tools/subagent.js";
import { createPiSubagentRunner } from "./subagent-session.js";
import type { PiAgentSessionOptions } from "./session.js";

export const createPiResourceLoader = async (
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  options: PiAgentSessionOptions = {},
) => {
  const sandboxConfig = options.sandboxConfig ?? loadPiSandboxConfig(command.workspacePath);
  const enabledSkills = runtimeResourcesFor(command).skills?.enabled ?? [];
  const builtins = resolveBuiltins(enabledSkills);
  const plugins = await createPluginRuntimeBridge(command);
  try {
    assertPluginToolNamesAvailable(plugins?.toolSchemas().map((tool) => tool.name) ?? [], builtins);
    const parentTools = [
      ...normalizeAllowedAgentTools(allowedRuntimeTools(command)),
      ...(plugins?.toolSchemas().map((tool) => tool.name) ?? []),
    ];
    const skills = loadPiSkills(command, builtins, plugins?.skills ?? []);
    const loader = new DefaultResourceLoader({
      cwd: command.workspacePath,
      agentDir: getAgentDir(),
      noExtensions: true,
      noSkills: true,
      ...(options.rolePrompt ? { systemPromptOverride: () => options.rolePrompt } : {}),
      extensionFactories: [
        (pi) => {
          registerPiSandbox(pi, command.workspacePath, sandboxConfig);
          if (!options.subagent) {
            registerPiSubagentTool(pi, createPiSubagentRunner(command, callbacks, parentTools, sandboxConfig));
          }
          registerPiAskUserTool(pi, command.taskId, callbacks.requestUserInput);
          for (const tool of builtins.requiredTools.internal) {
            registerPiBuiltinTool(pi, tool, { workspacePath: command.workspacePath });
          }
          plugins?.registerTools(pi);
          plugins?.registerSkills(pi, skills);
        },
      ],
      skillsOverride: () => ({
        skills,
        diagnostics: [],
      }),
    });

    await loader.reload();
    return {
      loader,
      pluginToolNames: plugins?.toolSchemas().map((tool) => tool.name) ?? [],
      dispose: () => plugins?.dispose() ?? Promise.resolve(),
    };
  } catch (error) {
    await plugins?.dispose();
    throw error;
  }
};

const loadPiSkills = (
  command: RuntimeAgentCommand,
  builtins: ResolvedBuiltins,
  pluginSkills: readonly Skill[],
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

  const externalSkills = runtimeSkillSourcePaths(command).flatMap(
    (dir) =>
      loadSkillsFromDir({
        dir,
        source: "runtime",
      }).skills,
  );

  const resolved = [
    ...builtinSkills.filter((skill) => enabledNames.has(skill.name)),
    ...externalSkills.filter((skill) => enabledNames.has(skill.name) && !reservedNames.has(skill.name)),
  ];
  const resolvedNames = new Set(resolved.map((skill) => skill.name));
  return [
    ...resolved,
    ...pluginSkills.filter(
      (skill) => !skill.disableModelInvocation && !reservedNames.has(skill.name) && !resolvedNames.has(skill.name),
    ),
  ];
};

const assertPluginToolNamesAvailable = (names: readonly string[], builtins: ResolvedBuiltins) => {
  const reserved = new Set([
    ...AGENT_TOOL_DEFINITIONS.map((tool) => tool.name),
    ...builtins.requiredTools.internal.map((tool) => tool.name),
  ]);
  const collisions = names.filter((name) => reserved.has(name));
  if (collisions.length > 0) {
    throw new Error(`插件工具不能覆盖 Isle Runtime 工具：${collisions.join(", ")}`);
  }
};
