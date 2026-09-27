import { invoke } from "@/transport";
import type { AgentDefinition, SaveAgentInput } from "@/workbench/pages/settings/agents/types";

type AgentDefinitionSettings = {
  agents: AgentDefinition[];
};

export async function getAgentSettings() {
  return invoke<AgentDefinitionSettings>("get_agent_settings");
}

export async function saveAgent(input: SaveAgentInput) {
  return invoke<AgentDefinitionSettings>("save_agent", { input });
}

export async function deleteAgent(id: string) {
  return invoke<AgentDefinitionSettings>("delete_agent", { id });
}
