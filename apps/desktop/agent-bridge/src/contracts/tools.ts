export type BuiltInAgentToolName =
  | "read"
  | "bash"
  | "edit"
  | "write"
  | "grep"
  | "find"
  | "ls";

export type AskUserAgentToolName = "ask_user";
export type KnownAgentToolName = BuiltInAgentToolName | AskUserAgentToolName;
export type AgentToolName = KnownAgentToolName | (string & {});

export const KNOWN_AGENT_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
  "ask_user",
] as const satisfies readonly KnownAgentToolName[];

export const HIGH_RISK_AGENT_TOOL_NAMES = [
  "bash",
] as const satisfies readonly KnownAgentToolName[];

const highRiskAgentToolNames = new Set<KnownAgentToolName>(HIGH_RISK_AGENT_TOOL_NAMES);

export const DEFAULT_ALLOWED_AGENT_TOOLS = KNOWN_AGENT_TOOL_NAMES
  .filter((tool) => !highRiskAgentToolNames.has(tool));

export const normalizeAllowedAgentTools = (
  tools: readonly string[] | undefined,
): AgentToolName[] => {
  if (!tools) {
    return [...DEFAULT_ALLOWED_AGENT_TOOLS];
  }

  return [...new Set(tools)] as AgentToolName[];
};
