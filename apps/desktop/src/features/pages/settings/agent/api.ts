import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AiAgentSettings,
  SaveAiAgentInput,
  SaveCollaborationWorkflowInput,
} from "./types";

const emptySettings = {
  agents: [],
  collaborationWorkflows: [],
} satisfies AiAgentSettings;

export async function getAiAgentSettings() {
  if (!isTauri()) {
    return emptySettings;
  }

  return invoke<AiAgentSettings>("get_ai_agent_settings");
}

export async function saveAiAgent(input: SaveAiAgentInput) {
  if (!isTauri()) {
    return emptySettings;
  }

  return invoke<AiAgentSettings>("save_ai_agent", { input });
}

export async function deleteAiAgent(id: string) {
  if (!isTauri()) {
    return emptySettings;
  }

  return invoke<AiAgentSettings>("delete_ai_agent", { id });
}

export async function saveCollaborationWorkflow(input: SaveCollaborationWorkflowInput) {
  if (!isTauri()) {
    return emptySettings;
  }

  return invoke<AiAgentSettings>("save_collaboration_workflow", { input });
}

export async function deleteCollaborationWorkflow(id: string) {
  if (!isTauri()) {
    return emptySettings;
  }

  return invoke<AiAgentSettings>("delete_collaboration_workflow", { id });
}
