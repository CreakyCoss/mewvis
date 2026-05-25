export type BuiltInAgentToolName =
  | "read"
  | "bash"
  | "edit"
  | "write"
  | "grep"
  | "find"
  | "ls";

export type NovelClawAgentToolName = "ask_user";
export type KnownAgentToolName = BuiltInAgentToolName | NovelClawAgentToolName;
export type AgentToolName = KnownAgentToolName | (string & {});

export const DEFAULT_ALLOWED_AGENT_TOOLS = [
  "read",
  "edit",
  "write",
  "ls",
  "find",
  "grep",
  "ask_user",
] as const satisfies readonly AgentToolName[];

export const normalizeAllowedAgentTools = (
  tools: readonly string[] | undefined,
): AgentToolName[] => {
  if (!tools) {
    return [...DEFAULT_ALLOWED_AGENT_TOOLS];
  }

  return [...new Set(tools)] as AgentToolName[];
};
