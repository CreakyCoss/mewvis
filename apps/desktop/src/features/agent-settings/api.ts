import { invoke } from "@tauri-apps/api/core";
import type { AiAgentSettings, SaveAiAgentInput } from "./types";

export async function getAiAgentSettings() {
  return invoke<AiAgentSettings>("get_ai_agent_settings");
}

export async function saveAiAgent(input: SaveAiAgentInput) {
  return invoke<AiAgentSettings>("save_ai_agent", { input });
}

export async function deleteAiAgent(id: string) {
  return invoke<AiAgentSettings>("delete_ai_agent", { id });
}
