import { useCallback, useEffect, useMemo, useState } from "react";
import { getAiAgentSettings } from "@/features/pages/settings/agent/api";
import type { AiAgent } from "@/features/pages/settings/agent/types";
import { resolveAgentProfiles } from "@/features/pages/settings/agent/utils";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";

type UseRuntimeAgentSettingsInput = {
  agentClient?: unknown;
  capability?: unknown;
};

export const useRuntimeAgentSettings = (_input: UseRuntimeAgentSettingsInput = {}) => {
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadLlmSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModelError = useLlmSettingsStore((store) => store.error);

  const [selectedRuntimeModelId, setSelectedRuntimeModelId] = useState("");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  const loadLlmOptions = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError("");

    try {
      const [agentSettings] = await Promise.all([getAiAgentSettings(), loadLlmSettings()]);
      const runtimeModelState = useLlmSettingsStore.getState();
      if (runtimeModelState.error) {
        throw new Error(runtimeModelState.error);
      }

      setAgents(agentSettings.agents);
      setSelectedAgentId((currentAgentId) =>
        agentSettings.agents.some((agent) => agent.id === currentAgentId) ? currentAgentId : "",
      );
    } catch (caught) {
      setSettingsError(String(caught));
    } finally {
      setIsSettingsLoading(false);
    }
  }, [loadLlmSettings]);

  useEffect(() => {
    void loadLlmOptions();
  }, [loadLlmOptions]);

  useEffect(() => {
    setSelectedRuntimeModelId((currentId) => {
      const current = runtimeModels.find((model) => model.id === currentId);
      return current?.id ?? runtimeModels[0]?.id ?? "";
    });
  }, [runtimeModels]);

  const selectedRuntimeModel = useMemo(
    () => runtimeModels.find((model) => model.id === selectedRuntimeModelId) ?? runtimeModels[0] ?? null,
    [runtimeModels, selectedRuntimeModelId],
  );
  const runtimeAgentRequiresModel = true;
  const agentProfiles = useMemo(() => resolveAgentProfiles(agents), [agents]);
  const selectedAgent = useMemo(
    () => agentProfiles.find((agent) => agent.id === selectedAgentId) ?? null,
    [agentProfiles, selectedAgentId],
  );
  const effectiveRuntimeModel = selectedRuntimeModel;

  useEffect(() => {
    if (runtimeModelError) {
      setSettingsError(runtimeModelError);
    }
  }, [runtimeModelError]);

  return {
    runtimeModels,
    selectedRuntimeModelId,
    setSelectedRuntimeModelId,
    selectedAgentId,
    setSelectedAgentId,
    settingsError,
    setSettingsError,
    isSettingsLoading,
    selectedRuntimeModel,
    runtimeAgentRequiresModel,
    agentProfiles,
    selectedAgent,
    effectiveRuntimeModel,
    loadLlmOptions,
  };
};
