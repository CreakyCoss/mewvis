import {
  DefaultResourceLoader,
  getAgentDir,
  loadSkillsFromDir,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type {
  AskUser,
  RuntimeAgentCommand,
} from "../../types.js";
import {
  enabledRuntimeSkillNames,
  runtimeSkillSourcePaths,
} from "../../resources.js";
import { registerPiAskUserTool } from "../tools/ask-user-tool.js";

export const createPiResourceLoader = async (
  command: RuntimeAgentCommand,
  askUser: AskUser,
) => {
  const enabledSkills = loadEnabledPiSkills(command);
  const loader = new DefaultResourceLoader({
    cwd: command.workspacePath,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    extensionFactories: [
      (pi) => {
        registerPiAskUserTool(pi, command.taskId, askUser);
      },
    ],
    skillsOverride: () => ({
      skills: enabledSkills,
      diagnostics: [],
    }),
  });

  await loader.reload();
  return loader;
};

const loadEnabledPiSkills = (command: RuntimeAgentCommand): Skill[] => {
  const enabledNames = new Set(enabledRuntimeSkillNames(command));
  const paths = runtimeSkillSourcePaths(command);
  if (paths.length === 0 || enabledNames.size === 0) {
    return [];
  }

  const skills = paths.flatMap((dir) =>
    loadSkillsFromDir({
      dir,
      source: "bridge",
    }).skills,
  );

  return skills.filter((skill) => enabledNames.has(skill.name));
};
