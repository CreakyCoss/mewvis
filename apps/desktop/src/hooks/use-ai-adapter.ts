import { useCallback, useState } from "react";
import { createAdapter } from "@/ai/adapters/factory";
import type { AIAdapter } from "@/ai/adapters/base";
import { toProviderConfig } from "@/ai/registry";
import { getLlmSettings } from "@/features/llm-settings/api";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import { findDefaultProvider } from "@/features/llm-settings/utils";

export const useAIAdapter = () => {
  const [adapter, setAdapter] = useState<AIAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAdapter = useCallback(async (
    selectedProvider?: LlmProvider,
    selectedModel?: ProviderModel,
  ) => {
    setIsLoading(true);
    setError("");

    try {
      const settings = selectedProvider ? null : await getLlmSettings();
      const provider = selectedProvider ?? findDefaultProvider(settings?.providers ?? []);

      if (!provider) {
        throw new Error("请先配置 LLM Provider");
      }

      const config = toProviderConfig(provider, selectedModel);

      if (!config) {
        throw new Error("请至少启用一个模型");
      }

      const nextAdapter = await createAdapter(config.provider, config);
      setAdapter(nextAdapter);
      return nextAdapter;
    } catch (caught) {
      setError(String(caught));
      setAdapter(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    adapter,
    isLoading,
    error,
    loadAdapter,
  };
};
