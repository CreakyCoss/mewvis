import type { AgentDefinition } from "@/workbench/pages/agents/types";
import type { ChatRunConfig, MessageInput, ChatResources } from "../core";

/** References override the conversation selection for this turn, without changing saved preferences. */
export function resolveTurnAgent(agents: AgentDefinition[], config: ChatRunConfig, input: MessageInput) {
  const ids = [
    ...new Set((input.blocks ?? []).flatMap((block) => (block.type === "agent-reference" ? [block.agentId] : []))),
  ];
  if (ids.length > 1) throw new Error("每次请求只能引用一个智能体，请移除多余引用。");
  const id = ids[0] ?? config.selectedAgentId;
  const agent = agents.find((item) => item.id === id) ?? null;
  if (ids.length && !agent) throw new Error("引用的智能体已删除，请重新选择。");
  return agent;
}

export function resolveAgentCapabilities(
  agent: AgentDefinition | null,
  config: ChatRunConfig,
  resources: ChatResources,
  skillKeys?: string[],
) {
  const availableSkills = new Set(
    skillKeys ?? (resources.skillGroups ?? []).flatMap((group) => group.skills.map((skill) => skill.key)),
  );
  const availableKnowledge = new Set((resources.knowledgeCollections ?? []).map((item) => item.value));
  return {
    skillKeys: [...new Set([...config.selectedSkillKeys, ...(agent?.skillKeys ?? [])])].filter((key) =>
      availableSkills.has(key),
    ),
    knowledgeIds: [
      ...new Set([...config.selectedKnowledgeCollectionIds, ...(agent?.knowledgeCollectionIds ?? [])]),
    ].filter((id) => availableKnowledge.has(id)),
    // An empty list inherits the chat's tools. A bound list restricts them within the scene's permissions.
    toolNames: (resources.tools ?? [])
      .map((tool) => tool.value)
      .filter((name) => !agent?.toolNames.length || agent.toolNames.includes(name)),
  };
}
