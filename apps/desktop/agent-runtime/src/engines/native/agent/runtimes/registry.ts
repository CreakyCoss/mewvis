import type { RuntimeAgentDefinition } from "../../../protocol/index.js";
import type { RuntimeAgent } from "./types.js";
import { mockRuntimeAgent } from "./mock/index.js";
import { piRuntimeAgent } from "./pi/index.js";

const runtimeAgents = Object.freeze([
  piRuntimeAgent,
  mockRuntimeAgent,
] satisfies readonly RuntimeAgent[]);

const createRuntimeAgentRegistry = (
  agents: readonly RuntimeAgent[],
): Readonly<Record<string, RuntimeAgent>> =>
  Object.freeze(Object.fromEntries(agents.map((agent) => [agent.id, agent])));

const toRuntimeAgentDefinition = (agent: RuntimeAgent): RuntimeAgentDefinition =>
  Object.freeze({
    id: agent.id,
    label: agent.label,
    description: agent.description,
    capabilities: Object.freeze([...agent.capabilities]),
    requiresModel: agent.requiresModel,
  });

const runtimeAgentRegistry = createRuntimeAgentRegistry(runtimeAgents);

export const runtimeAgentManifest = Object.freeze({
  defaultAgentId: piRuntimeAgent.id,
  definitions: Object.freeze(runtimeAgents.map(toRuntimeAgentDefinition)),
});

export const resolveRuntimeAgent = (agentId?: string | null) => {
  const resolvedAgentId = agentId?.trim() || runtimeAgentManifest.defaultAgentId;
  const runtimeAgent = runtimeAgentRegistry[resolvedAgentId];
  if (!runtimeAgent) {
    throw new Error(`未配置 agent：${resolvedAgentId}`);
  }

  return runtimeAgent;
};
