import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RuntimeAgentCapability,
  RuntimeAgentDefinition,
} from "@/ai/runtime-protocol";
import { getAiAgentSettings } from "@/features/pages/settings/agent/api";
import type {
  AiAgent,
} from "@/features/pages/settings/agent/types";
import {
  resolveAgentProfiles,
} from "@/features/pages/settings/agent/utils";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import type { ModelSource } from "../../page-types";

type RuntimeAgentSource = {
  listAgents: () => Promise<Readonly<{
    agents: readonly RuntimeAgentDefinition[];
    defaultAgentId: string;
  }>>;
};

type UseModelSettingsInput = {
  agentRuntime: RuntimeAgentSource;
};

export const useModelSettings = ({
  agentRuntime,
}: UseModelSettingsInput) => {
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadLlmSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModelError = useLlmSettingsStore((store) => store.error);

  const [runtimeAgents, setRuntimeAgents] = useState<RuntimeAgentDefinition[]>([]);
  const [defaultRuntimeAgentId, setDefaultRuntimeAgentId] = useState("");
  const [selectedRuntimeAgentId, setSelectedRuntimeAgentId] = useState("");
  const [selectedRuntimeModelId, setSelectedRuntimeModelId] = useState("");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [modelSource, setModelSource] = useState<ModelSource>("direct");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);

  const loadLlmOptions = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError("");

    try {
      const [agentSettings] = await Promise.all([
        getAiAgentSettings(),
        loadLlmSettings(),
      ]);
      const runtimeModelState = useLlmSettingsStore.getState();
      if (runtimeModelState.error) {
        throw new Error(runtimeModelState.error);
      }
      const nextRuntimeModels = runtimeModelState.runtimeModels;

      setAgents(agentSettings.agents);
      setSelectedAgentId((currentAgentId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextRuntimeModels);
        const currentProfile = profiles.find((agent) => agent.id === currentAgentId);
        return currentProfile?.id ?? profiles[0]?.id ?? "";
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
  }, [loadLlmSettings]);

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

  useEffect(() => {
    setSelectedRuntimeModelId((currentId) => {
      const current = runtimeModels.find((model) => model.id === currentId);
      return current?.id ?? runtimeModels[0]?.id ?? "";
    });
  }, [runtimeModels]);

  const selectedRuntimeModel = useMemo(
    () => runtimeModels.find((model) => model.id === selectedRuntimeModelId)
      ?? runtimeModels[0]
      ?? null,
    [runtimeModels, selectedRuntimeModelId],
  );
  const runtimeAgentCapability: RuntimeAgentCapability = "agent";
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
  const selectedAgent = useMemo(
    () => agentProfiles.find((agent) => agent.id === selectedAgentId)
      ?? agentProfiles[0]
      ?? null,
    [agentProfiles, selectedAgentId],
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

  return {
    runtimeModels,
    selectedRuntimeModelId,
    setSelectedRuntimeModelId,
    modelSource,
    setModelSource,
    selectedAgentId,
    setSelectedAgentId,
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
    selectedAgent,
    effectiveRuntimeModel,
    loadLlmOptions,
  };
};
