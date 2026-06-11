import { createRuntimeModelInputConfig } from "@/ai/llm/model-catalog";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import type { AgentRuntimeModelInput } from "@/ai/agent-runtime/contracts";

export const toAgentRuntimeModelInput = (
  provider: Pick<LlmProvider, "provider" | "apiFormat" | "apiKey" | "apiEndpoint">,
  model: ProviderModel,
): AgentRuntimeModelInput => createRuntimeModelInputConfig(provider, model);
