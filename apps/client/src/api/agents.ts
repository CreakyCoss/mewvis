import { invoke } from "@/transport";
import type { AiAgent, SaveAiAgentInput } from "@/workbench/pages/settings/agent/types";

type AiAgentSettings = {
  agents: AiAgent[];
};

export async function getAiAgentSettings() {
  return invoke<AiAgentSettings>("get_ai_agent_settings");
}

export async function saveAiAgent(input: SaveAiAgentInput) {
  return invoke<AiAgentSettings>("save_ai_agent", { input });
}

export async function deleteAiAgent(id: string) {
  return invoke<AiAgentSettings>("delete_ai_agent", { id });
}
