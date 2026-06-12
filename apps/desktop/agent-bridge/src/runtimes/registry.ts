import type { BridgeAgent } from "../contracts/runtime.js";
import { toBridgeAgentDefinition } from "../contracts/agents.js";
import { mockBridgeAgent } from "./mock/index.js";
import { piBridgeAgent } from "./pi/index.js";

const bridgeAgents = Object.freeze([
  piBridgeAgent,
  mockBridgeAgent,
] satisfies readonly BridgeAgent[]);

const createBridgeAgentRegistry = (
  agents: readonly BridgeAgent[],
): Readonly<Record<string, BridgeAgent>> =>
  Object.freeze(Object.fromEntries(agents.map((agent) => [agent.id, agent])));

const bridgeAgentRegistry = createBridgeAgentRegistry(bridgeAgents);

export const bridgeAgentManifest = Object.freeze({
  defaultAgentId: piBridgeAgent.id,
  definitions: Object.freeze(bridgeAgents.map(toBridgeAgentDefinition)),
});

export const resolveBridgeAgent = (agentId?: string | null) => {
  const resolvedAgentId = agentId?.trim() || bridgeAgentManifest.defaultAgentId;
  const bridgeAgent = bridgeAgentRegistry[resolvedAgentId];
  if (!bridgeAgent) {
    throw new Error(`未配置 agent：${resolvedAgentId}`);
  }

  return bridgeAgent;
};
