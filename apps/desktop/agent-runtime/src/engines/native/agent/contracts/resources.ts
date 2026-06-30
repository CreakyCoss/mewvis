import type { AgentToolName } from "../tools/definitions.js";

export type AgentRuntimeMcpResources = {
  servers?: unknown[];
  [key: string]: unknown;
};

export type AgentRuntimeToolResources = {
  allowed?: AgentToolName[] | null;
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
