import type { RunAgentCommand } from "../../../../protocol/index.js";
import type { AgentRunCommand } from "../runtimes/types.js";

export const agentRunCommandFromRunAgent = (command: RunAgentCommand): AgentRunCommand => ({
  runtimeMode: "agent",
  requestId: command.requestId ?? null,
  taskId: command.taskId,
  workspacePath: command.workspacePath,
  sessionRootDir: command.sessionRootDir ?? null,
  agentRoleId: command.agentRoleId ?? null,
  userMessage: command.userMessage,
  recordUserMessage: command.recordUserMessage ?? null,
  systemPrompt: command.systemPrompt ?? null,
  requestContext: command.requestContext ?? null,
  runtimeInstruction: command.runtimeInstruction ?? null,
  bootstrapInstruction: command.bootstrapInstruction ?? null,
  runtimeModel: command.runtimeModel ?? null,
  resources: command.resources ?? null,
  permissions: command.permissions,
  agentAccess: command.agentAccess,
  agentAccessRoots: command.agentAccessRoots,
});
