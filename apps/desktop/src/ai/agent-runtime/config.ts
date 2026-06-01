import { createRuntimeModelConfig } from "@/ai/llm/model-catalog";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import type {
  AgentRuntimeModelConfig,
  AgentRuntimeProviderConfig,
} from "@/ai/agent-runtime/contracts";

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
