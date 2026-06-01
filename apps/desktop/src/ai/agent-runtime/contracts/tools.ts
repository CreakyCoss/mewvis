import {
  AGENT_TOOL_DEFINITIONS as BRIDGE_AGENT_TOOL_DEFINITIONS,
  DEFAULT_ALLOWED_AGENT_TOOLS as BRIDGE_DEFAULT_ALLOWED_AGENT_TOOLS,
  normalizeAllowedAgentTools as normalizeBridgeAllowedAgentTools,
} from "@agent-bridge/contracts/tools";

export type AgentToolName = string;

export type AgentToolDefinition = Readonly<{
  name: AgentToolName;
  label: string;
  description: string;
  enabledByDefault: boolean;
}>;

type AgentToolDefinitions = readonly AgentToolDefinition[];

type BridgeAgentToolDefinition = (typeof BRIDGE_AGENT_TOOL_DEFINITIONS)[number];

const toAgentRuntimeToolDefinition = (tool: BridgeAgentToolDefinition): AgentToolDefinition =>
  Object.freeze({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    enabledByDefault: tool.enabledByDefault,
  } satisfies AgentToolDefinition);

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinitions = Object.freeze(
  BRIDGE_AGENT_TOOL_DEFINITIONS.map(toAgentRuntimeToolDefinition),
);

export const DEFAULT_ALLOWED_AGENT_TOOLS: readonly AgentToolName[] = Object.freeze([
  ...BRIDGE_DEFAULT_ALLOWED_AGENT_TOOLS,
]);

export const normalizeAllowedAgentTools = (
  tools: readonly AgentToolName[] | undefined,
): AgentToolName[] => normalizeBridgeAllowedAgentTools(tools);
