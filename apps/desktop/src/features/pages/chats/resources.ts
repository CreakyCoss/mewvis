import { createAgentClient } from "@/agent-client/runtime";
import { getAiAgentSettings } from "@/api/agents";
import { getLlmSettings } from "@/api/llm";
import { getWorkspaceSkills } from "@/api/skills";
import { buildRuntimeModelInputs, buildRuntimeModelOptions } from "@/features/pages/settings/llm/store/model";
import type { ChatInputResources } from "./components/chat-input/type";

export const loadResources = async (workspaceId: string): Promise<ChatInputResources> => {
  const agentClient = createAgentClient();

  try {
    const [llmSettings, agentSettings, skillSettings, toolSettings] = await Promise.all([
      getLlmSettings(),
      getAiAgentSettings(),
      workspaceId ? getWorkspaceSkills(workspaceId) : Promise.resolve({ skills: [], groups: [], defaultGroupId: "" }),
      agentClient.capabilities.listAgentTools(),
    ]);
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
      tools: toolSettings.tools.map((tool) => ({
        value: tool.name,
        label: tool.label,
        description: tool.description ?? "",
        isDefault: defaultToolNames.has(tool.name),
      })),
    };
  } catch {
    return {};
  }
};
