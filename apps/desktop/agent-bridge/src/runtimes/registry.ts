import type { BridgeAgent } from "../contracts/runtime.js";
import { toBridgeAgentDefinition } from "../contracts/agents.js";
import { mockBridgeAgent } from "./mock/index.js";
import { piBridgeAgent } from "./pi/index.js";

export const bridgeAgents = Object.freeze([
  piBridgeAgent,
  mockBridgeAgent,
] satisfies readonly BridgeAgent[]);

export const DEFAULT_BRIDGE_AGENT_ID = piBridgeAgent.id;

export const BRIDGE_AGENT_DEFINITIONS = Object.freeze(
  bridgeAgents.map(toBridgeAgentDefinition),
);

const createBridgeAgentRegistry = (
  agents: readonly BridgeAgent[],
): Readonly<Record<string, BridgeAgent>> =>
  Object.freeze(Object.fromEntries(agents.map((agent) => [agent.id, agent])));

export const bridgeAgentRegistry = createBridgeAgentRegistry(bridgeAgents);
