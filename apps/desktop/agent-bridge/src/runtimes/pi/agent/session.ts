import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { normalizeAllowedAgentTools } from "../../../tools/definitions.js";
import { allowedRuntimeTools } from "../../resources.js";
import type {
  AskUser,
  RuntimeAgentCommand,
} from "../../types.js";
import {
  createPiRuntimeModel,
  requirePiApiKey,
  requirePiRuntimeConfig,
  resolvePiRuntimeThinkingLevel,
} from "../model/index.js";
import { createPiResourceLoader } from "./resources.js";

export type PiAgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

export type PiAgentSessionCreateResult = {
  session: PiAgentSession;
  shouldBootstrap: boolean;
};

export const createPiAgentSession = async (
  command: RuntimeAgentCommand,
  askUser: AskUser,
): Promise<PiAgentSessionCreateResult> => {
  const runtimeModel = requirePiRuntimeConfig(command);
  const apiKey = requirePiApiKey(runtimeModel);
  const model = createPiRuntimeModel(runtimeModel);
  const thinkingLevel = resolvePiRuntimeThinkingLevel(runtimeModel);
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
    ...(thinkingLevel ? { thinkingLevel } : {}),
    tools: normalizeAllowedAgentTools(allowedRuntimeTools(command)),
  });

  return {
    session,
    shouldBootstrap: session.messages.length === 0,
  };
};

const createPiSessionManager = (command: RuntimeAgentCommand) => {
  const explicitSessionDir = resolvePiExplicitSessionDir(command);
  if (explicitSessionDir) {
    mkdirSync(explicitSessionDir, { recursive: true });
    return SessionManager.continueRecent(command.workspacePath, explicitSessionDir);
  }

  return SessionManager.inMemory(command.workspacePath);
};

const resolvePiExplicitSessionDir = (command: RuntimeAgentCommand) => {
  if (command.agentSessionDir?.trim()) {
    return command.agentSessionDir.trim();
  }
  return null;
};
