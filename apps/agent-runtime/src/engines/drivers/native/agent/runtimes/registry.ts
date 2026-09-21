import type { RuntimeAgentDefinition } from "../../../../protocol/index.js";
import type { RuntimeAgent } from "./types.js";
import { mockRuntimeAgent } from "./mock/index.js";
import { piRuntimeAgent } from "./pi/index.js";

export const builtinRuntimeAgents = Object.freeze([piRuntimeAgent, mockRuntimeAgent] satisfies readonly RuntimeAgent[]);

export function createRuntimeAgentRegistry(agents: readonly RuntimeAgent[], defaultAgentId = "pi") {
  const registry = new Map<string, RuntimeAgent>();
  for (const agent of agents) {
    if (!agent.id.trim() || agent.id !== agent.id.trim() || registry.has(agent.id))
      throw new Error(`runtime agent ID 为空或重复：${agent.id}`);
    for (const mode of ["agent", "chat"] as const) {
      if (agent.capabilities.includes(mode) !== Boolean(agent[mode]))
        throw new Error(`runtime agent 能力声明不匹配：${agent.id}/${mode}`);
    }
    registry.set(agent.id, Object.freeze({ ...agent, capabilities: Object.freeze([...agent.capabilities]) }));
  }
  if (!registry.has(defaultAgentId)) throw new Error(`默认 runtime agent 未注册：${defaultAgentId}`);
  const definitions: readonly RuntimeAgentDefinition[] = Object.freeze(
    [...registry.values()].map((agent) =>
      Object.freeze({
        id: agent.id,
        label: agent.label,
        description: agent.description,
        capabilities: agent.capabilities,
        requiresModel: agent.requiresModel,
      }),
    ),
  );
  return Object.freeze({
    manifest: Object.freeze({ defaultAgentId, definitions }),
    resolve(runtimeId?: string | null): RuntimeAgent {
      const id = runtimeId?.trim() || defaultAgentId;
      const agent = registry.get(id);
      if (!agent) throw new Error(`未配置 runtime agent：${id}`);
      return agent;
    },
  });
}

export type RuntimeAgentRegistry = ReturnType<typeof createRuntimeAgentRegistry>;
export const defaultRuntimeAgentRegistry = createRuntimeAgentRegistry(builtinRuntimeAgents);
export const runtimeAgentManifest = defaultRuntimeAgentRegistry.manifest;
export const resolveRuntimeAgent = defaultRuntimeAgentRegistry.resolve;
