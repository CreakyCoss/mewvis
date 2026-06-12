export type BridgeAgentCapability = "agent" | "chat";

export type BridgeAgentDefinition = Readonly<{
  id: string;
  label: string;
  description: string;
  capabilities: readonly BridgeAgentCapability[];
  requiresModel: boolean;
}>;
