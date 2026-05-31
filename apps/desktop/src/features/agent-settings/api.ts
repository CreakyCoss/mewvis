import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AiAgentSettings, SaveAiAgentInput } from "./types";

export async function getAiAgentSettings() {
  if (!isTauri()) {
    return { agents: [] } satisfies AiAgentSettings;
  }

  return invoke<AiAgentSettings>("get_ai_agent_settings");
}

export async function saveAiAgent(input: SaveAiAgentInput) {
  if (!isTauri()) {
    return { agents: [] } satisfies AiAgentSettings;
  }

  return invoke<AiAgentSettings>("save_ai_agent", { input });
}

export async function deleteAiAgent(id: string) {
  if (!isTauri()) {
    return { agents: [] } satisfies AiAgentSettings;
  }

  return invoke<AiAgentSettings>("delete_ai_agent", { id });
}
