import {
  DefaultResourceLoader,
  getAgentDir,
  loadSkillsFromDir,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type {
  AskUser,
  RuntimeStartTaskCommand,
} from "../../types.js";
import { registerPiAskUserTool } from "../tools/ask-user-tool.js";

export const createPiResourceLoader = async (
  command: RuntimeStartTaskCommand,
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

const loadEnabledPiSkills = (command: RuntimeStartTaskCommand): Skill[] => {
  const enabledNames = new Set(command.enabledSkills ?? []);
  const paths = piSkillSourcePaths(command);
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

const piSkillSourcePaths = (command: RuntimeStartTaskCommand) => {
  const paths = [
    ...(Array.isArray(command.bundledSkillsPath)
      ? command.bundledSkillsPath
      : command.bundledSkillsPath
        ? [command.bundledSkillsPath]
        : []),
    ...(command.skillPaths ?? []),
  ];

  return [...new Set(paths.filter(Boolean))];
};
