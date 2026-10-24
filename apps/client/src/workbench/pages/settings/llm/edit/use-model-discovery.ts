import { useEffect, useRef, useState } from "react";
import type { DiscoveredProviderModel } from "@mewvis/chat-contracts";
import type { LlmProviderConfig } from "@/agent-client/runtime-model";
import { discoverProviderModels } from "@/api/llm";

export type ModelDiscoveryState = {
  models: DiscoveredProviderModel[];
  isLoading: boolean;
  error: string;
};

const emptyState: ModelDiscoveryState = { models: [], isLoading: false, error: "" };

export function useModelDiscovery(provider: LlmProviderConfig | null) {
  const key = provider
    ? JSON.stringify([provider.id, provider.provider, provider.apiFormat, provider.apiEndpoint, provider.apiKey])
    : "";
  const [result, setResult] = useState({ ...emptyState, key: "" });
  const request = useRef<{ key: string; controller: AbortController } | null>(null);

  useEffect(() => {
    setResult({ ...emptyState, key });
    return () => {
      request.current?.controller.abort();
      request.current = null;
    };
  }, [key]);

  const state: ModelDiscoveryState = result.key === key ? result : emptyState;
  const load = (refresh = false) => {
    if (!provider || request.current?.key === key || (!refresh && state.models.length > 0)) return;
    request.current?.controller.abort();
    const current = { key, controller: new AbortController() };
    request.current = current;
    setResult({ ...state, key, isLoading: true, error: "" });
    void discoverProviderModels(
      { apiFormat: provider.apiFormat, apiEndpoint: provider.apiEndpoint, apiKey: provider.apiKey },
      current.controller.signal,
    )
      .then(({ models }) => {
        if (request.current === current) setResult({ key, models, isLoading: false, error: "" });
      })
      .catch((caught: unknown) => {
        if (request.current === current)
          setResult({
            ...state,
            key,
            isLoading: false,
            error: caught instanceof Error ? caught.message : String(caught),
          });
      })
      .finally(() => {
        if (request.current === current) request.current = null;
      });
  };

  return { ...state, load };
}
