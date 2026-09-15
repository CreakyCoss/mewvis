import { invoke } from "@/transport";
import type { AiAgent, SaveAiAgentInput } from "@/workbench/pages/settings/agent/types";
import type { CollaborationWorkflow, SaveCollaborationWorkflowInput } from "@/workbench/pages/settings/workflow/types";

type AiAgentSettings = {
  agents: AiAgent[];
  collaborationWorkflows: CollaborationWorkflow[];
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

export async function saveCollaborationWorkflow(input: SaveCollaborationWorkflowInput) {
  return invoke<AiAgentSettings>("save_collaboration_workflow", { input });
}

export async function deleteCollaborationWorkflow(id: string) {
  return invoke<AiAgentSettings>("delete_collaboration_workflow", { id });
}
