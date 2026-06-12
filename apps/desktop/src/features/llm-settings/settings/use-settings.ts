import { useCallback, useEffect, useMemo, useState } from "react";
import { getLlmSettings, saveLlmSettings } from "./api";
import type {
  LlmProviderConfig,
  LlmSettingsConfig,
  ProviderModelConfig,
} from "./types";
import {
  createModelConfig,
  createProviderConfig,
  normalizeLlmSettingsConfig,
  toLlmSettingsConfig,
  validateLlmSettingsConfig,
} from "./draft";

export const useSettings = (open: boolean) => {
  const [draft, setDraft] = useState<LlmSettingsConfig>({ providers: [] });
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedProvider = useMemo(() => {
    return draft.providers.find(
      (provider) => provider.id === selectedProviderId,
    );
  }, [draft.providers, selectedProviderId]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const settings = await getLlmSettings();
      const nextDraft = toLlmSettingsConfig(settings);
      setDraft(nextDraft);
      setSelectedProviderId(nextDraft.providers[0]?.id ?? "");
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

  const addProvider = useCallback(() => {
    setDraft((current) => {
      const provider = {
        ...createProviderConfig(),
        isDefault: current.providers.length === 0,
      };
      setSelectedProviderId(provider.id);
      return { providers: [...current.providers, provider] };
    });
  }, []);

  const removeProvider = useCallback((providerId: string) => {
    setDraft((current) => {
      const providers = current.providers.filter(
        (provider) => provider.id !== providerId,
      );
      const hasDefault = providers.some((provider) => provider.isDefault);
      const normalizedProviders =
        hasDefault || !providers[0]
          ? providers
          : [{ ...providers[0], isDefault: true }, ...providers.slice(1)];

      setSelectedProviderId((selected) => {
        if (selected !== providerId) {
          return selected;
        }

        return normalizedProviders[0]?.id ?? "";
      });

      return { providers: normalizedProviders };
    });
  }, []);

  const updateProvider = useCallback(
    (
      providerId: string,
      updater: (provider: LlmProviderConfig) => LlmProviderConfig,
    ) => {
      setDraft((current) => ({
        providers: current.providers.map((provider) =>
          provider.id === providerId ? updater(provider) : provider,
        ),
      }));
    },
    [],
  );

  const updateModel = useCallback(
    (
      providerId: string,
      modelConfigId: string,
      updater: (model: ProviderModelConfig) => ProviderModelConfig,
    ) => {
      updateProvider(providerId, (provider) => ({
        ...provider,
        models: provider.models.map((model) =>
          model.id === modelConfigId ? updater(model) : model,
        ),
      }));
    },
    [updateProvider],
  );

  const setDefaultProvider = useCallback((providerId: string) => {
    setDraft((current) => ({
      providers: current.providers.map((provider) => ({
        ...provider,
        isDefault: provider.id === providerId,
      })),
    }));
  }, []);

  const addModel = useCallback((providerId: string) => {
    updateProvider(providerId, (provider) => ({
      ...provider,
      models: [...provider.models, createModelConfig()],
    }));
  }, [updateProvider]);

  const removeModel = useCallback(
    (providerId: string, modelId: string) => {
      updateProvider(providerId, (provider) => ({
        ...provider,
        models: provider.models.filter((model) => model.id !== modelId),
      }));
    },
    [updateProvider],
  );

  const save = useCallback(async () => {
    const normalizedDraft = normalizeLlmSettingsConfig(draft);
    const validationError = validateLlmSettingsConfig(normalizedDraft);

    if (validationError) {
      setError(validationError);
      return false;
    }

    setIsSaving(true);
    setError("");

    try {
      const settings = await saveLlmSettings(normalizedDraft);
      const nextDraft = toLlmSettingsConfig(settings);
      setDraft(nextDraft);
      setSelectedProviderId(nextDraft.providers[0]?.id ?? "");
      return true;
    } catch (caught) {
      setError(String(caught));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [draft]);

  return {
    draft,
    selectedProvider,
    selectedProviderId,
    isLoading,
    isSaving,
    error,
    setSelectedProviderId,
    addProvider,
    removeProvider,
    updateProvider,
    updateModel,
    setDefaultProvider,
    addModel,
    removeModel,
    save,
  };
};
