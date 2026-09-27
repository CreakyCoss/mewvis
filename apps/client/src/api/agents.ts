import { invoke } from "@/transport";
import type { AgentDefinition, AgentTemplate, SaveAgentInput } from "@/workbench/pages/settings/agents/types";

type AgentDefinitionSettings = {
  agents: AgentDefinition[];
};

export async function getAgentTemplates() {
  return invoke<{ templates: AgentTemplate[] }>("get_agent_templates");
}

export async function getAgentSettings() {
  return invoke<AgentDefinitionSettings>("get_agent_settings");
}

export async function addAgentFromTemplate(templateId: string) {
  return invoke<AgentDefinitionSettings>("add_agent_from_template", { templateId });
}

export async function resetAgent(id: string) {
  return invoke<AgentDefinitionSettings>("reset_agent", { id });
}

export async function saveAgent(input: SaveAgentInput) {
  return invoke<AgentDefinitionSettings>("save_agent", { input });
}

export async function deleteAgent(id: string) {
  return invoke<AgentDefinitionSettings>("delete_agent", { id });
}
