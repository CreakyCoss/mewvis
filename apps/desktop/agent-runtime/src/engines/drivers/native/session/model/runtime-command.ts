export type RuntimeSessionLink = {
  parentEntryId?: string | null;
  rootUserEntryId?: string | null;
  turnId?: string | null;
};

export type RuntimeAgentSessionCommand = {
  runtimeMode: "agent";
  requestId?: string | null;
  runtimeId?: string | null;
  taskId: string;
  workspacePath?: string | null;
  sessionRootDir?: string | null;
  agentRoleId?: string | null;
  userMessage: string;
  recordUserMessage?: boolean | null;
  systemPrompt?: string | null;
  requestContext?: string | null;
  runtimeInstruction?: string | null;
  sessionLink?: RuntimeSessionLink | null;
};

export type RuntimeSessionCommand = RuntimeAgentSessionCommand;

export type SessionBackedRuntimeCommand = RuntimeSessionCommand & {
  workspacePath: string;
  sessionRootDir: string;
};

export const isRuntimeAgentSessionCommand = (
  command: RuntimeSessionCommand,
): command is RuntimeAgentSessionCommand =>
  "runtimeMode" in command && command.runtimeMode === "agent";
