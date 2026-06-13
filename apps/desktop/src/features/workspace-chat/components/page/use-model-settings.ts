import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentRuntimeAgentCapability,
  AgentRuntimeAgentDefinition,
} from "@/ai/agent-runtime/contracts";
import { getAiAgentSettings } from "@/features/agent-settings/api";
import type {
  AiAgent,
  CollaborationWorkflow,
} from "@/features/agent-settings/types";
import {
  resolveAgentProfiles,
  resolveCollaborationWorkflowProfiles,
} from "@/features/agent-settings/utils";
import { useLlmRuntimeModelStore } from "@/stores/llm-runtime-model";
import type { ChatExecutionMode, ChatMode, ModelSource } from "../../page-types";
import { isAgentTaskMode } from "../../utils/chat-mode";

type RuntimeAgentSource = {
  listAgents: () => Promise<Readonly<{
    agents: readonly AgentRuntimeAgentDefinition[];
    defaultAgentId: string;
  }>>;
};

type UseModelSettingsInput = {
  agentRuntime: RuntimeAgentSource;
  chatMode: ChatMode;
  chatExecutionMode: ChatExecutionMode;
};

export const useModelSettings = ({
  agentRuntime,
  chatMode,
  chatExecutionMode,
}: UseModelSettingsInput) => {
  const runtimeModels = useLlmRuntimeModelStore((store) => store.runtimeModels);
  const selectedRuntimeModelId = useLlmRuntimeModelStore((store) => store.selectedRuntimeModelId);
  const setSelectedRuntimeModelId = useLlmRuntimeModelStore((store) => store.setSelectedRuntimeModelId);
  const loadRuntimeModels = useLlmRuntimeModelStore((store) => store.loadRuntimeModels);
  const runtimeModelError = useLlmRuntimeModelStore((store) => store.error);

  const [runtimeAgents, setRuntimeAgents] = useState<AgentRuntimeAgentDefinition[]>([]);
  const [defaultRuntimeAgentId, setDefaultRuntimeAgentId] = useState("");
  const [selectedRuntimeAgentId, setSelectedRuntimeAgentId] = useState("");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [collaborationWorkflowSettings, setCollaborationWorkflowSettings] = useState<CollaborationWorkflow[]>([]);
  const [modelSource, setModelSource] = useState<ModelSource>("direct");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedCollaborationWorkflowId, setSelectedCollaborationWorkflowId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);

  const loadLlmOptions = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError("");

    try {
      const [agentSettings] = await Promise.all([
        getAiAgentSettings(),
        loadRuntimeModels(),
      ]);
      const runtimeModelState = useLlmRuntimeModelStore.getState();
      if (runtimeModelState.error) {
        throw new Error(runtimeModelState.error);
      }
      const nextRuntimeModels = runtimeModelState.runtimeModels;

      setAgents(agentSettings.agents);
      setCollaborationWorkflowSettings(agentSettings.collaborationWorkflows);
      setSelectedAgentId((currentAgentId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextRuntimeModels);
        const currentProfile = profiles.find((agent) => agent.id === currentAgentId);
        return currentProfile?.id ?? profiles[0]?.id ?? "";
      });
      setSelectedCollaborationWorkflowId((currentWorkflowId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextRuntimeModels);
        const workflowProfiles = resolveCollaborationWorkflowProfiles(
          agentSettings.collaborationWorkflows,
          profiles,
        );
        const currentWorkflow = workflowProfiles.find((workflow) => workflow.id === currentWorkflowId);
        return currentWorkflow?.id ?? workflowProfiles[0]?.id ?? "";
      });
      setModelSource((currentSource) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextRuntimeModels);
        return currentSource === "agent" && profiles.length === 0 ? "direct" : currentSource;
      });
    } catch (caught) {
      setSettingsError(String(caught));
    } finally {
      setHasLoadedSettings(true);
      setIsSettingsLoading(false);
    }
  }, [loadRuntimeModels]);

  const loadRuntimeAgents = useCallback(async () => {
    try {
      const definitions = await agentRuntime.listAgents();
      setRuntimeAgents([...definitions.agents]);
      setDefaultRuntimeAgentId(definitions.defaultAgentId);
      setSelectedRuntimeAgentId((currentAgentId) =>
        definitions.agents.some((agent) => agent.id === currentAgentId)
          ? currentAgentId
          : definitions.defaultAgentId,
      );
    } catch (caught) {
      setSettingsError(String(caught));
    }
  }, [agentRuntime]);

  useEffect(() => {
    void loadLlmOptions();
  }, [loadLlmOptions]);

  useEffect(() => {
    void loadRuntimeAgents();
  }, [loadRuntimeAgents]);

  const selectedRuntimeModel = useMemo(
    () => runtimeModels.find((model) => model.id === selectedRuntimeModelId)
      ?? runtimeModels[0]
      ?? null,
    [runtimeModels, selectedRuntimeModelId],
  );
  const runtimeAgentCapability: AgentRuntimeAgentCapability =
    isAgentTaskMode(chatMode, chatExecutionMode) ? "agent" : "chat";
  const availableRuntimeAgents = useMemo(
    () => runtimeAgents.filter((agent) =>
      agent.capabilities.includes(runtimeAgentCapability),
    ),
    [runtimeAgentCapability, runtimeAgents],
  );
  const selectedRuntimeAgent = useMemo(
    () => availableRuntimeAgents.find((agent) => agent.id === selectedRuntimeAgentId)
      ?? availableRuntimeAgents.find((agent) => agent.id === defaultRuntimeAgentId)
      ?? availableRuntimeAgents[0]
      ?? null,
    [availableRuntimeAgents, defaultRuntimeAgentId, selectedRuntimeAgentId],
  );
  const runtimeAgentId = selectedRuntimeAgent?.id ?? defaultRuntimeAgentId;
  const runtimeAgentRequiresModel = selectedRuntimeAgent?.requiresModel ?? true;
  const agentProfiles = useMemo(
    () => resolveAgentProfiles(agents, runtimeModels),
    [agents, runtimeModels],
  );
  const collaborationWorkflows = useMemo(
    () => resolveCollaborationWorkflowProfiles(collaborationWorkflowSettings, agentProfiles),
    [agentProfiles, collaborationWorkflowSettings],
  );
  const selectedAgent = useMemo(
    () => agentProfiles.find((agent) => agent.id === selectedAgentId)
      ?? agentProfiles[0]
      ?? null,
    [agentProfiles, selectedAgentId],
  );
  const selectedCollaborationWorkflow = useMemo(
    () => collaborationWorkflows.find((workflow) => workflow.id === selectedCollaborationWorkflowId)
      ?? collaborationWorkflows[0]
      ?? null,
    [collaborationWorkflows, selectedCollaborationWorkflowId],
  );
  const effectiveRuntimeModel = modelSource === "agent"
    ? selectedAgent?.runtimeModel ?? null
    : selectedRuntimeModel;

  useEffect(() => {
    if (runtimeModelError) {
      setSettingsError(runtimeModelError);
    }
  }, [runtimeModelError]);

  useEffect(() => {
    if (selectedRuntimeAgent && selectedRuntimeAgent.id !== selectedRuntimeAgentId) {
      setSelectedRuntimeAgentId(selectedRuntimeAgent.id);
    }
  }, [selectedRuntimeAgent, selectedRuntimeAgentId]);

  useEffect(() => {
    if (hasLoadedSettings && modelSource === "agent" && !selectedAgent && agentProfiles.length === 0) {
      setModelSource("direct");
    }
  }, [agentProfiles.length, hasLoadedSettings, modelSource, selectedAgent]);

  useEffect(() => {
    if (!selectedCollaborationWorkflow) {
      setSelectedCollaborationWorkflowId("");
      return;
    }

    if (!collaborationWorkflows.some((workflow) => workflow.id === selectedCollaborationWorkflowId)) {
      setSelectedCollaborationWorkflowId(selectedCollaborationWorkflow.id);
    }
  }, [collaborationWorkflows, selectedCollaborationWorkflow, selectedCollaborationWorkflowId]);

  return {
    runtimeModels,
    selectedRuntimeModelId,
    setSelectedRuntimeModelId,
    modelSource,
    setModelSource,
    selectedAgentId,
    setSelectedAgentId,
    selectedCollaborationWorkflowId,
    setSelectedCollaborationWorkflowId,
    settingsError,
    setSettingsError,
    isSettingsLoading,
    selectedRuntimeModel,
    availableRuntimeAgents,
    selectedRuntimeAgent,
    selectedRuntimeAgentId,
    setSelectedRuntimeAgentId,
    runtimeAgentId,
    runtimeAgentRequiresModel,
    agentProfiles,
    collaborationWorkflows,
    selectedCollaborationWorkflow,
    selectedAgent,
    effectiveRuntimeModel,
    loadLlmOptions,
  };
};
