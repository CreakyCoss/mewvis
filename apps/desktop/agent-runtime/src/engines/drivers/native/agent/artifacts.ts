import { createRuntimeSessionManager } from "../session/index.js";
import type { RuntimeSessionProviderId } from "../session/providers/types.js";

const sanitizeAgentSessionSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || fallback;
};

export const createAgentSessionPlan = async (input: {
  workspacePath: string;
  sessionRootDir: string;
  sessionProviderId?: RuntimeSessionProviderId | null;
  runtimeId: string;
  agentRoleId?: string | null;
}) => {
  const runtimeKey = sanitizeAgentSessionSegment(input.runtimeId, "runtime");
  const agentRoleId = sanitizeAgentSessionSegment(input.agentRoleId ?? "default", "default");
  const sessionDir = await createRuntimeSessionManager({
    workspacePath: input.workspacePath,
    sessionRootDir: input.sessionRootDir,
    providerId: input.sessionProviderId,
  }).resolveArtifactDir([
    "agents",
    runtimeKey,
    agentRoleId,
  ]);

  return {
    agentRoleId,
    agentSessionId: `${runtimeKey}/${agentRoleId}`,
    agentSessionDir: sessionDir,
  };
};

export const clearAgentSessionArtifacts = async (input: {
  workspacePath: string;
  sessionRootDir: string;
  sessionProviderId?: RuntimeSessionProviderId | null;
}) => {
  await createRuntimeSessionManager({
    workspacePath: input.workspacePath,
    sessionRootDir: input.sessionRootDir,
    providerId: input.sessionProviderId,
  }).clearArtifactDir(["agents"]);
};
