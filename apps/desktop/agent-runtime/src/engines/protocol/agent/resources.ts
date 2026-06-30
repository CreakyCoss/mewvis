export type AgentRuntimeMcpResources = {
  servers?: unknown[];
  [key: string]: unknown;
};

export type AgentRuntimeToolResources = {
  allowed?: string[] | null;
};

export type AgentRuntimeSkillResources = {
  bundledPath?: string | string[] | null;
  paths?: string[] | null;
  enabled?: string[] | null;
};

export type AgentRuntimeResources = {
  tools?: AgentRuntimeToolResources | null;
  skills?: AgentRuntimeSkillResources | null;
  mcp?: AgentRuntimeMcpResources | null;
};
