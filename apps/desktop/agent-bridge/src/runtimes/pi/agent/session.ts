import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import productConfig from "../../../../../product.config.json" with { type: "json" };
import { normalizeAllowedAgentTools } from "../../../tools/definitions.js";
import type {
  AskUser,
  RuntimeStartTaskCommand,
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
  command: RuntimeStartTaskCommand,
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
