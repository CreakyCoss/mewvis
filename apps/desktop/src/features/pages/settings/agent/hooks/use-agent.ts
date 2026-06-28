import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeAgentAvatarId } from "@/assets/agent-avatars";
import {
  deleteAiAgent,
  deleteCollaborationWorkflow,
  getAiAgentSettings,
  saveAiAgent,
  saveAgentRuntimeSettings,
  saveCollaborationWorkflow,
} from "../api";
import type {
  AgentRuntimeSettings,
  AiAgent,
  CollaborationWorkflow,
  SaveAgentRuntimeSettingsInput,
  SaveAiAgentInput,
  SaveCollaborationWorkflowInput,
} from "../types";
import {
  agentToDraft,
  createAgentDraft,
  createCollaborationWorkflowDraft,
  resolveAgentProfiles,
} from "../utils";

type AgentSettingsSelectionKind = "agent" | "workflow";

const workflowToDraft = (workflow: CollaborationWorkflow): SaveCollaborationWorkflowInput => ({
  id: workflow.id,
  name: workflow.name,
  description: workflow.description ?? "",
  writerAgentId: workflow.writerAgentId,
  reviewerAgentId: workflow.reviewerAgentId,
  draftInstruction: workflow.draftInstruction ?? "",
  reviewInstruction: workflow.reviewInstruction ?? "",
  reviseInstruction: workflow.reviseInstruction ?? "",
  steps: workflow.steps.map((step) => ({
    id: step.id,
    name: step.name,
    agentId: step.agentId,
    instruction: step.instruction ?? "",
    phase: step.phase,
  })),
});

export const useAgentSettings = (open: boolean) => {
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [workflows, setWorkflows] = useState<CollaborationWorkflow[]>([]);
  const [runtimeSettings, setRuntimeSettings] = useState<AgentRuntimeSettings>({
    defaultCollaborationExecutorId: null,
  });
  const [draft, setDraft] = useState<SaveAiAgentInput>(() => createAgentDraft());
  const [workflowDraft, setWorkflowDraft] = useState<SaveCollaborationWorkflowInput>(() =>
    createCollaborationWorkflowDraft([]),
  );
  const [selectionKind, setSelectionKind] = useState<AgentSettingsSelectionKind>("agent");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const agentProfiles = useMemo(
    () => resolveAgentProfiles(agents),
    [agents],
  );
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [selectedWorkflowId, workflows],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const agentSettings = await getAiAgentSettings();
      const profiles = resolveAgentProfiles(agentSettings.agents);
      const nextAgent = agentSettings.agents[0];
      const nextWorkflow = agentSettings.collaborationWorkflows[0];

      setAgents(agentSettings.agents);
      setWorkflows(agentSettings.collaborationWorkflows);
      setRuntimeSettings(agentSettings.runtime);
      setSelectionKind(nextAgent ? "agent" : nextWorkflow ? "workflow" : "agent");
      setSelectedAgentId(nextAgent?.id ?? "");
      setSelectedWorkflowId(nextWorkflow?.id ?? "");
      setDraft(
        nextAgent
          ? {
              ...agentToDraft(nextAgent),
              avatar: normalizeAgentAvatarId(nextAgent.avatar),
            }
          : createAgentDraft(),
      );
      setWorkflowDraft(
        nextWorkflow ? workflowToDraft(nextWorkflow) : createCollaborationWorkflowDraft(profiles),
      );
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [load, open]);

  const selectAgent = useCallback((agentId: string) => {
    setSelectionKind("agent");
    setSelectedAgentId(agentId);
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }
    setDraft({
      ...agentToDraft(agent),
      avatar: normalizeAgentAvatarId(agent.avatar),
    });
  }, [agents]);

  const createNew = useCallback(() => {
    setSelectionKind("agent");
    setSelectedAgentId("");
    setDraft(createAgentDraft());
  }, []);

  const selectWorkflow = useCallback((workflowId: string) => {
    setSelectionKind("workflow");
    setSelectedWorkflowId(workflowId);
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) {
      return;
    }
    setWorkflowDraft(workflowToDraft(workflow));
  }, [workflows]);

  const createNewWorkflow = useCallback(() => {
    setSelectionKind("workflow");
    setSelectedWorkflowId("");
    setWorkflowDraft(createCollaborationWorkflowDraft(agentProfiles));
  }, [agentProfiles]);

  const updateDraft = useCallback((updater: (current: SaveAiAgentInput) => SaveAiAgentInput) => {
    setDraft(updater);
  }, []);

  const updateWorkflowDraft = useCallback((
    updater: (current: SaveCollaborationWorkflowInput) => SaveCollaborationWorkflowInput,
  ) => {
    setWorkflowDraft(updater);
  }, []);

  const save = useCallback(async () => {
    if (!draft.name.trim()) {
      setError("角色名称不能为空");
      return false;
    }

    setIsSaving(true);
    setError("");

    try {
      const settings = await saveAiAgent({
        ...draft,
        name: draft.name.trim(),
        avatar: normalizeAgentAvatarId(draft.avatar),
        description: draft.description?.trim() || null,
      });
      setAgents(settings.agents);
      setWorkflows(settings.collaborationWorkflows);
      setRuntimeSettings(settings.runtime);
      const saved = settings.agents.find((agent) => agent.id === draft.id)
        ?? settings.agents.find((agent) => agent.name === draft.name.trim())
        ?? settings.agents[settings.agents.length - 1];
      setSelectedAgentId(saved?.id ?? "");
      if (saved) {
        setDraft({
          ...agentToDraft(saved),
          avatar: normalizeAgentAvatarId(saved.avatar),
        });
      }
      return true;
    } catch (caught) {
      setError(String(caught));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [draft]);

  const saveWorkflow = useCallback(async () => {
    if (!workflowDraft.name.trim()) {
      setError("协作流程名称不能为空");
      return false;
    }
    const steps = workflowDraft.steps ?? [];
    if (steps.length === 0) {
      setError("请至少配置一个协作步骤");
      return false;
    }
    const invalidStepIndex = steps.findIndex((step) => !step.name.trim() || !step.agentId);
    if (invalidStepIndex >= 0) {
      setError(`请完善第 ${invalidStepIndex + 1} 个协作步骤`);
      return false;
    }
    const firstStep = steps[0];
    const reviewerStep = steps.find((step) => step.agentId !== firstStep.agentId)
      ?? steps[1]
      ?? firstStep;

    setIsSaving(true);
    setError("");

    try {
      const settings = await saveCollaborationWorkflow({
        ...workflowDraft,
        name: workflowDraft.name.trim(),
        description: workflowDraft.description?.trim() || null,
        writerAgentId: firstStep.agentId,
        reviewerAgentId: reviewerStep.agentId,
        draftInstruction: workflowDraft.draftInstruction?.trim() || null,
        reviewInstruction: workflowDraft.reviewInstruction?.trim() || null,
        reviseInstruction: workflowDraft.reviseInstruction?.trim() || null,
        steps: steps.map((step) => ({
          ...step,
          name: step.name.trim(),
          instruction: step.instruction?.trim() || null,
        })),
      });
      setAgents(settings.agents);
      setWorkflows(settings.collaborationWorkflows);
      setRuntimeSettings(settings.runtime);
      const saved = settings.collaborationWorkflows.find((workflow) => workflow.id === workflowDraft.id)
        ?? settings.collaborationWorkflows.find((workflow) => workflow.name === workflowDraft.name.trim())
        ?? settings.collaborationWorkflows[settings.collaborationWorkflows.length - 1];
      setSelectedWorkflowId(saved?.id ?? "");
      setSelectionKind("workflow");
      if (saved) {
        setWorkflowDraft(workflowToDraft(saved));
      }
      return true;
    } catch (caught) {
      setError(String(caught));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [workflowDraft]);

  const remove = useCallback(async (agentId: string) => {
    setIsSaving(true);
    setError("");

    try {
      const settings = await deleteAiAgent(agentId);
      setAgents(settings.agents);
      setWorkflows(settings.collaborationWorkflows);
      setRuntimeSettings(settings.runtime);
      const nextAgent = settings.agents[0];
      setSelectedAgentId(nextAgent?.id ?? "");
      setDraft(
        nextAgent
          ? {
              ...agentToDraft(nextAgent),
              avatar: normalizeAgentAvatarId(nextAgent.avatar),
            }
          : createAgentDraft(),
      );
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  }, []);

  const removeWorkflow = useCallback(async (workflowId: string) => {
    setIsSaving(true);
    setError("");

    try {
      const settings = await deleteCollaborationWorkflow(workflowId);
      const profiles = resolveAgentProfiles(settings.agents);
      const nextWorkflow = settings.collaborationWorkflows[0];

      setAgents(settings.agents);
      setWorkflows(settings.collaborationWorkflows);
      setRuntimeSettings(settings.runtime);
      setSelectedWorkflowId(nextWorkflow?.id ?? "");
      setWorkflowDraft(
        nextWorkflow ? workflowToDraft(nextWorkflow) : createCollaborationWorkflowDraft(profiles),
      );
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  }, []);

  const saveRuntimeSettings = useCallback(async (input: SaveAgentRuntimeSettingsInput) => {
    setIsSaving(true);
    setError("");

    try {
      const settings = await saveAgentRuntimeSettings(input);
      setAgents(settings.agents);
      setWorkflows(settings.collaborationWorkflows);
      setRuntimeSettings(settings.runtime);
      return true;
    } catch (caught) {
      setError(String(caught));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    agents,
    workflows,
    runtimeSettings,
    draft,
    workflowDraft,
    selectionKind,
    selectedAgent,
    selectedAgentId,
    selectedWorkflow,
    selectedWorkflowId,
    agentProfiles,
    isLoading,
    isSaving,
    error,
    createNew,
    selectAgent,
    createNewWorkflow,
    selectWorkflow,
    updateDraft,
    updateWorkflowDraft,
    save,
    saveWorkflow,
    saveRuntimeSettings,
    remove,
    removeWorkflow,
  };
};
