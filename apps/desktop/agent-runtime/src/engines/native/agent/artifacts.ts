import { createRuntimeSessionManager } from "../session/index.js";

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
  runtimeId: string;
  agentRoleId?: string | null;
}) => {
  const runtimeKey = sanitizeAgentSessionSegment(input.runtimeId, "runtime");
  const agentRoleId = sanitizeAgentSessionSegment(input.agentRoleId ?? "default", "default");
  const sessionDir = await createRuntimeSessionManager(input).resolveArtifactDir([
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
}) => {
  await createRuntimeSessionManager(input).clearArtifactDir(["agents"]);
};
