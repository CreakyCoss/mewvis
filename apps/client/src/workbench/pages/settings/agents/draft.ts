import type { AgentDefinition, AgentTemplate, SaveAgentInput } from "./types";

// Templates are configurations, not saved agents: omit identity and reference metadata.
export function createAgentDraft(configuration?: AgentTemplate | AgentDefinition): SaveAgentInput {
  return {
    name: configuration?.name ?? "",
    avatar: configuration?.avatar ?? "agent-office",
    summary: configuration?.summary ?? "",
    category: configuration?.category ?? "自定义",
    instructions: configuration?.instructions ?? "",
    useCases: [...(configuration?.useCases ?? [])],
    starterPrompts: [...(configuration?.starterPrompts ?? [])],
    skillKeys: [...(configuration?.skillKeys ?? [])],
    toolNames: [...(configuration?.toolNames ?? [])],
    knowledgeCollectionIds: [...(configuration?.knowledgeCollectionIds ?? [])],
  };
}
