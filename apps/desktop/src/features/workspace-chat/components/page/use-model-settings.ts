import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentRuntimeAgentCapability,
  AgentRuntimeAgentDefinition,
} from "@/ai/agent-runtime/contracts";
import { getAiAgentSettings } from "@/features/agent-settings/api";
import type { AiAgent, CollaborationWorkflow } from "@/features/agent-settings/types";
import {
  resolveAgentProfiles,
  resolveCollaborationWorkflowProfiles,
} from "@/features/agent-settings/utils";
import { getLlmSettings } from "@/features/llm-settings/api";
import type { LlmProvider } from "@/ai/llm/types";
import { findDefaultProvider } from "@/features/llm-settings/utils";
import type { ChatMode, ModelSource } from "../../page-types";

type RuntimeAgentSource = {
  listAgents: () => Promise<Readonly<{
    agents: readonly AgentRuntimeAgentDefinition[];
    defaultAgentId: string;
  }>>;
};

type UseModelSettingsInput = {
  agentRuntime: RuntimeAgentSource;
  chatMode: ChatMode;
};

export const useModelSettings = ({
  agentRuntime,
  chatMode,
}: UseModelSettingsInput) => {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
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
      const [settings, agentSettings] = await Promise.all([
        getLlmSettings(),
        getAiAgentSettings(),
      ]);
      const nextProviders = settings.providers;
      const defaultProvider = findDefaultProvider(nextProviders);

      setProviders(nextProviders);
      setAgents(agentSettings.agents);
      setCollaborationWorkflowSettings(agentSettings.collaborationWorkflows);
      setSelectedProviderId((currentProviderId) => {
        const currentProvider = nextProviders.find((provider) => provider.id === currentProviderId);
        const nextProvider = currentProvider ?? defaultProvider;

        setSelectedModelId((currentModelId) => {
          const currentModel = nextProvider?.models.find((model) => model.id === currentModelId && model.isEnabled);
          const nextModel = currentModel ?? nextProvider?.models.find((model) => model.isEnabled);
          return nextModel?.id ?? "";
        });

        return nextProvider?.id ?? "";
      });
      setSelectedAgentId((currentAgentId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        const currentProfile = profiles.find((agent) => agent.id === currentAgentId);
        return currentProfile?.id ?? profiles[0]?.id ?? "";
      });
      setSelectedCollaborationWorkflowId((currentWorkflowId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        const workflowProfiles = resolveCollaborationWorkflowProfiles(
          agentSettings.collaborationWorkflows,
          profiles,
        );
        const currentWorkflow = workflowProfiles.find((workflow) => workflow.id === currentWorkflowId);
        return currentWorkflow?.id ?? workflowProfiles[0]?.id ?? "";
      });
      setModelSource((currentSource) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        return currentSource === "agent" && profiles.length === 0 ? "direct" : currentSource;
      });
    } catch (caught) {
      setSettingsError(String(caught));
    } finally {
      setHasLoadedSettings(true);
      setIsSettingsLoading(false);
    }
  }, []);

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

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const selectedModels = useMemo(
    () => selectedProvider?.models.filter((model) => model.isEnabled) ?? [],
    [selectedProvider],
  );

  const selectedModel = useMemo(
    () => selectedModels.find((model) => model.id === selectedModelId)
      ?? selectedModels[0]
      ?? null,
    [selectedModelId, selectedModels],
  );
  const runtimeAgentCapability: AgentRuntimeAgentCapability = chatMode === "agent" ? "agent" : "chat";
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
    () => resolveAgentProfiles(agents, providers),
    [agents, providers],
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
  const effectiveProvider = modelSource === "agent"
    ? selectedAgent?.provider ?? null
    : selectedProvider;
  const effectiveModel = modelSource === "agent"
    ? selectedAgent?.model ?? null
    : selectedModel;

  useEffect(() => {
    if (selectedRuntimeAgent && selectedRuntimeAgent.id !== selectedRuntimeAgentId) {
      setSelectedRuntimeAgentId(selectedRuntimeAgent.id);
    }
  }, [selectedRuntimeAgent, selectedRuntimeAgentId]);

  useEffect(() => {
    if (!selectedProvider) {
      setSelectedModelId("");
      return;
    }

    if (!selectedModel || !selectedProvider.models.some((model) => model.id === selectedModel.id)) {
      setSelectedModelId(selectedProvider.models.find((model) => model.isEnabled)?.id ?? "");
    }
  }, [selectedModel, selectedProvider]);

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
    providers,
    selectedProviderId,
    setSelectedProviderId,
    selectedModelId,
    setSelectedModelId,
    modelSource,
    setModelSource,
    selectedAgentId,
    setSelectedAgentId,
    selectedCollaborationWorkflowId,
    setSelectedCollaborationWorkflowId,
    settingsError,
    setSettingsError,
    isSettingsLoading,
    selectedProvider,
    selectedModel,
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
    effectiveProvider,
    effectiveModel,
    loadLlmOptions,
  };
};
