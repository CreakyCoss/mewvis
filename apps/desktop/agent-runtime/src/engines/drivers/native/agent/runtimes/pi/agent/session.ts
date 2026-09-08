import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { normalizeAllowedAgentTools } from "../../../tools/definitions.js";
import { allowedRuntimeTools } from "../../resources.js";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import {
  createPiRuntimeModel,
  requirePiApiKey,
  requirePiRuntimeConfig,
  resolvePiRuntimeThinkingLevel,
} from "../model/index.js";
import { createPiResourceLoader } from "./resources.js";
import type { PiSandboxConfig } from "../tools/sandbox.js";

export type PiAgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

export type PiAgentSessionOptions = {
  subagent?: boolean;
  toolCeiling?: readonly string[];
  rolePrompt?: string;
  sandboxConfig?: PiSandboxConfig;
};

export type PiAgentSessionCreateResult = {
  session: PiAgentSession;
  shouldBootstrap: boolean;
  disposeResources(): Promise<void>;
};

export const createPiAgentSession = async (
  command: RuntimeAgentCommand,
  callbacks: AgentRuntimeCallbacks,
  options: PiAgentSessionOptions = {},
): Promise<PiAgentSessionCreateResult> => {
  const runtimeModel = requirePiRuntimeConfig(command);
  const apiKey = requirePiApiKey(runtimeModel);
  const model = createPiRuntimeModel(runtimeModel);
  const thinkingLevel = resolvePiRuntimeThinkingLevel(runtimeModel);
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(model.provider, apiKey);
  const resources = await createPiResourceLoader(command, callbacks, options);
  const sessionManager = createPiSessionManager(command);
  try {
    const enabledTools = [...normalizeAllowedAgentTools(allowedRuntimeTools(command)), ...resources.pluginToolNames]
      .filter((name, index, names) => names.indexOf(name) === index)
      .filter((name) => !options.toolCeiling || options.toolCeiling.includes(name))
      .filter((name) => !options.subagent || (name !== "subagent" && name !== "ask_user"));
    const { session } = await createAgentSession({
      cwd: command.workspacePath,
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
      sessionManager,
      resourceLoader: resources.loader,
      model,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      tools: enabledTools,
    });

    return {
      session,
      shouldBootstrap: session.messages.length === 0,
      disposeResources: resources.dispose,
    };
  } catch (error) {
    await resources.dispose();
    throw error;
  }
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
