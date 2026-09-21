import type { ExtensionBindings } from "@isle/extension-sdk";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { mkdirSync } from "node:fs";
import type { AgentRuntimeCallbacks, RuntimeAgentCommand } from "../../types.js";
import { createPiModelRuntime, requirePiRuntimeConfig } from "../model/index.js";
import { createPiResourceLoader } from "./resources.js";
import type { SafetyPolicy } from "../../../../../../../security/safety/index.js";
import type { ExecutionPolicy } from "../../../../../../../security/execution/index.js";
import type { ResolvedAgentAccess } from "../../../../../../../security/access/index.js";

export type PiAgentSession = Awaited<ReturnType<typeof createAgentSession>>["session"];

export type PiAgentSessionOptions = {
  extensions?: ExtensionBindings;
  subagent?: boolean;
  toolCeiling?: readonly string[];
  rolePrompt?: string;
  policies?: {
    safety: SafetyPolicy | null;
    execution: ExecutionPolicy;
    access?: ResolvedAgentAccess;
  };
  signal?: AbortSignal;
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
  const { model, modelRuntime, thinkingLevel } = await createPiModelRuntime(runtimeModel, options.signal);
  const resources = await createPiResourceLoader(command, callbacks, options);
  const sessionManager = createPiSessionManager(command);
  try {
    options.signal?.throwIfAborted();
    const { session } = await createAgentSession({
      cwd: command.workspacePath,
      modelRuntime,
      sessionManager,
      resourceLoader: resources.loader,
      settingsManager: resources.settingsManager,
      model,
      thinkingLevel: thinkingLevel ?? "off",
      tools: resources.toolNames,
    });

    resources.installSafety(session);
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
