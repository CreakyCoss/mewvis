export type AgentRuntimeAgentCapability = "agent" | "chat";

export type AgentRuntimeAgentDefinition = Readonly<{
  id: string;
  label: string;
  description: string;
  capabilities: readonly AgentRuntimeAgentCapability[];
  requiresModel: boolean;
}>;

export type AgentRuntimeAgentDefinitionsResult = Readonly<{
  defaultAgentId: string;
  agents: readonly AgentRuntimeAgentDefinition[];
}>;
