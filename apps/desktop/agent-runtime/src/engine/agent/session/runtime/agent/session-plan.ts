import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentRunCommand } from "../../../runtimes/types.js";
import { resolveRuntimeSessionPaths } from "../../../../../session/storage/paths.js";

const sanitizeSegment = (value: string, fallback: string) => {
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
  const paths = await resolveRuntimeSessionPaths(input);
  const runtimeKey = sanitizeSegment(input.runtimeId, "runtime");
  const agentRoleId = sanitizeSegment(input.agentRoleId ?? "default", "default");
  const sessionDir = resolve(paths.agentsDir, runtimeKey, agentRoleId);
  await mkdir(sessionDir, { recursive: true });

  return {
    agentRoleId,
    agentSessionId: `${runtimeKey}/${agentRoleId}`,
    agentSessionDir: sessionDir,
  };
};

export const resolveAgentSessionDir = async (
  command: AgentRunCommand,
  runtimeId: string,
) => {
  if (!command.sessionRootDir?.trim()) {
    return null;
  }

  const paths = await resolveRuntimeSessionPaths({
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
  });
  const runtimeKey = sanitizeSegment(runtimeId, "runtime");
  const agentRoleId = sanitizeSegment(command.agentRoleId ?? "default", "default");
  const sessionDir = resolve(paths.agentsDir, runtimeKey, agentRoleId);
  await mkdir(sessionDir, { recursive: true });
  return sessionDir;
};
