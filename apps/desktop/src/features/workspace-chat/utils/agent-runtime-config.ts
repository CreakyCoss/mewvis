import { createRuntimeModelConfig } from "@/features/llm-settings/model-catalog";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type {
  AgentRuntimeModelConfig,
  AgentRuntimeProviderConfig,
} from "@/agent-runtime/contract";

export const toAgentRuntimeProviderConfig = (
  provider: LlmProvider,
): AgentRuntimeProviderConfig => ({
  id: provider.id,
  name: provider.name,
  vendor: provider.vendor,
  provider: provider.provider,
  apiKey: provider.apiKey,
  baseUrl: provider.baseUrl,
});

export const toAgentRuntimeModelConfig = (
  provider: Pick<LlmProvider, "vendor" | "provider" | "baseUrl">,
  model: ProviderModel,
): AgentRuntimeModelConfig => createRuntimeModelConfig(provider, model);
