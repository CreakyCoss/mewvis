import { defaultAgentAvatar } from "@/assets/agent-avatars";
import type { LlmProvider } from "@/features/llm-settings/types";
import { findDefaultProvider } from "@/features/llm-settings/utils";
import type { AgentProfile, AiAgent, SaveAiAgentInput } from "./types";

export const DEFAULT_AGENT_ID = "default-agent";

export const defaultAgentDescription =
  "跟随默认 LLM 配置的通用创作助手，适合日常写作、分析和文件编辑。";

export const createDefaultAgentProfile = (
  providers: LlmProvider[],
): AgentProfile | null => {
  const provider = findDefaultProvider(providers);
  const model = provider?.models.find((item) => item.isEnabled) ?? null;
  if (!provider || !model) {
    return null;
  }

  return {
    id: DEFAULT_AGENT_ID,
    name: "默认 Agent",
    avatar: defaultAgentAvatar.id,
    description: defaultAgentDescription,
    provider,
    model,
    isDefault: true,
  };
};

export const resolveAgentProfiles = (
  agents: AiAgent[],
  providers: LlmProvider[],
): AgentProfile[] => {
  const defaultAgent = createDefaultAgentProfile(providers);
  const customAgents = agents.flatMap((agent) => {
    const provider = providers.find((item) => item.id === agent.providerId);
    const model = provider?.models.find((item) => item.id === agent.modelId && item.isEnabled);
    if (!provider || !model) {
      return [];
    }

    return [{
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      description: agent.description,
      provider,
      model,
      isDefault: false,
    }];
  });

  return defaultAgent ? [defaultAgent, ...customAgents] : customAgents;
};

export const createAgentDraft = (
  providers: LlmProvider[],
): SaveAiAgentInput => {
  const provider = findDefaultProvider(providers) ?? providers[0];
  const model = provider?.models.find((item) => item.isEnabled) ?? provider?.models[0];

  return {
    id: null,
    name: "",
    avatar: defaultAgentAvatar.id,
    description: "",
    providerId: provider?.id ?? "",
    modelId: model?.id ?? "",
  };
};
