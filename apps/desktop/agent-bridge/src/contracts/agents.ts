export type BridgeAgentCapability = "agent" | "chat";

export type BridgeAgentDefinition = Readonly<{
  id: string;
  label: string;
  description: string;
  capabilities: readonly BridgeAgentCapability[];
  requiresModel: boolean;
}>;

export const defineBridgeAgentDefinition = <const T extends BridgeAgentDefinition>(
  definition: T,
): Readonly<T> =>
  Object.freeze({
    ...definition,
    capabilities: Object.freeze([...definition.capabilities]),
  } as T);

export const toBridgeAgentDefinition = (
  agent: BridgeAgentDefinition,
): BridgeAgentDefinition =>
  defineBridgeAgentDefinition({
    id: agent.id,
    label: agent.label,
    description: agent.description,
    capabilities: agent.capabilities,
    requiresModel: agent.requiresModel,
  });

export type BridgeAgentId = string;
