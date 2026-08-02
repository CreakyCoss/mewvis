import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AiAgent, SaveAiAgentInput } from "@/features/pages/settings/agent/types";
import type { CollaborationWorkflow, SaveCollaborationWorkflowInput } from "@/features/pages/settings/workflow/types";

type AiAgentSettings = {
  agents: AiAgent[];
  collaborationWorkflows: CollaborationWorkflow[];
};

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
