import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  loadSkillsFromDir,
  ModelRegistry,
  SessionManager,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import productConfig from "../../../../product.config.json" with { type: "json" };
import { normalizeAllowedAgentTools } from "../../contracts/tools.js";
import type {
  AskUser,
  RuntimeStartTaskCommand,
} from "../../contracts/runtime.js";
import {
  createPiRuntimeModel,
  requirePiApiKey,
  requirePiRuntimeConfig,
} from "./model.js";
import { registerPiAskUserTool } from "./tools/ask-user.js";

export type PiAgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

export type PiAgentSessionCreateResult = {
  session: PiAgentSession;
  shouldBootstrap: boolean;
};

export const createPiAgentSession = async (
  command: RuntimeStartTaskCommand,
  askUser: AskUser,
): Promise<PiAgentSessionCreateResult> => {
  const runtimeModel = requirePiRuntimeConfig(command);
  const apiKey = requirePiApiKey(runtimeModel);
  const model = createPiRuntimeModel(runtimeModel);
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(model.provider, apiKey);
  const resourceLoader = await createPiResourceLoader(command, askUser);
  const sessionManager = createPiSessionManager(command);

  const { session } = await createAgentSession({
    cwd: command.workspacePath,
    authStorage,
    modelRegistry: ModelRegistry.inMemory(authStorage),
    sessionManager,
    resourceLoader,
    model,
    tools: normalizeAllowedAgentTools(command.allowedTools),
  });

  return {
    session,
    shouldBootstrap: session.messages.length === 0,
  };
};

const createPiSessionManager = (command: RuntimeStartTaskCommand) => {
  const sessionPath = normalizePiAgentSessionPath(command.chatSessionId);
  if (sessionPath.length === 0) {
    // TODO pi目录，而非内存
    return SessionManager.inMemory(command.workspacePath);
  }

  const sessionDir = resolve(
    command.workspacePath,
    productConfig.appDataDirName,
    "agent-sessions",
    ...sessionPath,
  );
  mkdirSync(sessionDir, { recursive: true });
  return SessionManager.continueRecent(command.workspacePath, sessionDir);
};

const normalizePiAgentSessionPath = (chatSessionId: string | null | undefined) => {
  const rawId = chatSessionId?.trim().replace(/\.json$/, "");
  if (!rawId) {
    return [];
  }

  const segments = rawId.split(/[\\/]+/).map((segment) => segment.trim()).filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) =>
      segment === "." ||
      segment === ".." ||
      segment.includes("..") ||
      segment.startsWith(".")
    )
  ) {
    throw new Error("聊天记录 ID 不合法，无法创建长期 Agent session");
  }
  return segments;
};

const createPiResourceLoader = async (
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
