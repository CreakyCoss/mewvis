import type { AgentRunCommand } from "../runtimes/types.js";
import {
  clearRuntimeSessionArtifactDir,
  resolveRuntimeSessionArtifactDir,
  sanitizeSessionArtifactSegment,
} from "../../session/artifacts.js";

export const createAgentSessionPlan = async (input: {
  workspacePath: string;
  sessionRootDir: string;
  runtimeId: string;
  agentRoleId?: string | null;
}) => {
  const runtimeKey = sanitizeSessionArtifactSegment(input.runtimeId, "runtime");
  const agentRoleId = sanitizeSessionArtifactSegment(input.agentRoleId ?? "default", "default");
  const sessionDir = await resolveRuntimeSessionArtifactDir(input, [
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

export const resolveAgentSessionDir = async (
  command: AgentRunCommand,
  runtimeId: string,
) => {
  if (!command.sessionRootDir?.trim()) {
    return null;
  }

  const plan = await createAgentSessionPlan({
    workspacePath: command.workspacePath,
    sessionRootDir: command.sessionRootDir,
    runtimeId,
    agentRoleId: command.agentRoleId,
  });
  return plan.agentSessionDir;
};

export const clearAgentSessionArtifacts = async (input: {
  workspacePath: string;
  sessionRootDir: string;
}) => {
  await clearRuntimeSessionArtifactDir(input, ["agents"]);
};
