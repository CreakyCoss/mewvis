import { createAgentClient } from "@/agent-client/runtime";
import { buildRuntimeModelInputs, buildRuntimeModelOptions } from "@/agent-client/runtime-model";
import { getAiAgentSettings } from "@/api/agents";
import { getLlmSettings } from "@/api/llm";
import { listKnowledgeLibrary } from "@/api/knowledge";
import { getSkills } from "@/api/skills";
import type { ChatInputResources } from "./components/chat-input/type";

const resourceValue = <T>(name: string, result: PromiseSettledResult<T>, fallback: T): T => {
  if (result.status === "fulfilled") {
    return result.value;
  }

  console.warn(`[chat-resources] ${name} 加载失败`, result.reason);
  return fallback;
};

export const loadResources = async (): Promise<ChatInputResources> => {
  const agentClient = createAgentClient();
  const [llmResult, agentResult, skillResult, knowledgeResult, toolResult] = await Promise.allSettled([
    getLlmSettings(),
    getAiAgentSettings(),
    getSkills(),
    listKnowledgeLibrary(),
    agentClient.capabilities.listAgentTools(),
  ]);
  const llmSettings = resourceValue("模型", llmResult, { providers: [] });
  const agentSettings = resourceValue("角色", agentResult, { agents: [], collaborationWorkflows: [] });
  const skillSettings = resourceValue("技能", skillResult, { skills: [], groups: [], defaultGroupId: "" });
  const knowledgeLibrary = resourceValue("知识库", knowledgeResult, { collections: [], sources: [] });
  const toolSettings = resourceValue("工具", toolResult, { tools: [], defaultToolNames: [] });
  const defaultToolNames = new Set(toolSettings.defaultToolNames);
  const models = buildRuntimeModelOptions(llmSettings);
  const runtimeModels = buildRuntimeModelInputs(llmSettings);
  const skillsByKey = new Map(skillSettings.skills.map((skill) => [skill.key, { ...skill, label: skill.name }]));

  return {
    models: models.flatMap((model, index) => {
      const runtimeModel = runtimeModels[model.id];

      return runtimeModel
        ? [
            {
              value: model.id,
              label: `${model.provider.name}/${model.modelName}`,
              selectedLabel: model.modelName,
              description: `${model.provider.name} / ${model.modelName}`,
              isDefault: index === 0,
              runtimeModel,
            },
          ]
        : [];
    }),
    agents: agentSettings.agents.map((agent) => ({
      value: agent.id,
      label: agent.name,
      description: agent.description ?? "",
      isDefault: false,
      agent,
    })),
    skillGroups: skillSettings.groups.map((group) => ({
      value: group.id,
      label: group.name,
      description: group.description ?? "",
      isDefault: group.id === skillSettings.defaultGroupId,
      skills: group.skills.flatMap((skill) => {
        const definition = skillsByKey.get(skill.key);
        return definition ? [definition] : [];
      }),
    })),
    knowledgeCollections: knowledgeLibrary.collections
      .filter((collection) => collection.enabled)
      .sort((left, right) => left.order - right.order || left.createdAt - right.createdAt)
      .map((collection) => ({
        value: collection.id,
        label: collection.name,
        description: collection.description ?? collection.sourceDirectory ?? "",
        sourceDirectory: collection.sourceDirectory,
        isDefault: true,
      })),
    tools: toolSettings.tools.map((tool) => ({
      value: tool.name,
      label: tool.label,
      description: tool.description ?? "",
      isDefault: defaultToolNames.has(tool.name),
    })),
  };
};
