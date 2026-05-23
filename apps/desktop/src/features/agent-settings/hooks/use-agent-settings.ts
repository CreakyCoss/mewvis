import { useCallback, useEffect, useMemo, useState } from "react";
import { getLlmSettings } from "@/features/llm-settings/api";
import type { LlmProvider } from "@/features/llm-settings/types";
import { deleteAiAgent, getAiAgentSettings, saveAiAgent } from "../api";
import type { AiAgent, SaveAiAgentInput } from "../types";
import { createAgentDraft } from "../utils";

export const useAgentSettings = (open: boolean) => {
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [draft, setDraft] = useState<SaveAiAgentInput>(() => createAgentDraft([]));
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === draft.providerId) ?? null,
    [draft.providerId, providers],
  );

  const selectedModels = useMemo(
    () => selectedProvider?.models.filter((model) => model.isEnabled) ?? [],
    [selectedProvider],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const [agentSettings, llmSettings] = await Promise.all([
        getAiAgentSettings(),
        getLlmSettings(),
      ]);
      setAgents(agentSettings.agents);
      setProviders(llmSettings.providers);
      setSelectedAgentId(agentSettings.agents[0]?.id ?? "");
      setDraft(
        agentSettings.agents[0]
          ? {
              id: agentSettings.agents[0].id,
              name: agentSettings.agents[0].name,
              avatar: agentSettings.agents[0].avatar,
              description: agentSettings.agents[0].description ?? "",
              providerId: agentSettings.agents[0].providerId,
              modelId: agentSettings.agents[0].modelId,
            }
          : createAgentDraft(llmSettings.providers),
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
    setSelectedAgentId(agentId);
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }
    setDraft({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      description: agent.description ?? "",
      providerId: agent.providerId,
      modelId: agent.modelId,
    });
  }, [agents]);

  const createNew = useCallback(() => {
    setSelectedAgentId("");
    setDraft(createAgentDraft(providers));
  }, [providers]);

  const updateDraft = useCallback((updater: (current: SaveAiAgentInput) => SaveAiAgentInput) => {
    setDraft(updater);
  }, []);

  const save = useCallback(async () => {
    if (!draft.name.trim()) {
      setError("Agent 名称不能为空");
      return false;
    }
    if (!draft.providerId || !draft.modelId) {
      setError("请选择 Agent 使用的 LLM 和模型");
      return false;
    }

    setIsSaving(true);
    setError("");

    try {
      const settings = await saveAiAgent({
        ...draft,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
      });
      setAgents(settings.agents);
      const saved = settings.agents.find((agent) => agent.id === draft.id)
        ?? settings.agents.find((agent) => agent.name === draft.name.trim())
        ?? settings.agents[settings.agents.length - 1];
      setSelectedAgentId(saved?.id ?? "");
      if (saved) {
        setDraft({
          id: saved.id,
          name: saved.name,
          avatar: saved.avatar,
          description: saved.description ?? "",
          providerId: saved.providerId,
          modelId: saved.modelId,
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

  const remove = useCallback(async (agentId: string) => {
    setIsSaving(true);
    setError("");

    try {
      const settings = await deleteAiAgent(agentId);
      setAgents(settings.agents);
      const nextAgent = settings.agents[0];
      setSelectedAgentId(nextAgent?.id ?? "");
      setDraft(
        nextAgent
          ? {
              id: nextAgent.id,
              name: nextAgent.name,
              avatar: nextAgent.avatar,
              description: nextAgent.description ?? "",
              providerId: nextAgent.providerId,
              modelId: nextAgent.modelId,
            }
          : createAgentDraft(providers),
      );
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  }, [providers]);

  return {
    agents,
    providers,
    draft,
    selectedAgent,
    selectedAgentId,
    selectedProvider,
    selectedModels,
    isLoading,
    isSaving,
    error,
    createNew,
    selectAgent,
    updateDraft,
    save,
    remove,
  };
};
