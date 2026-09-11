import { getLlmModelOptions } from "@/api/llm";
import { getAiAgentSettings } from "@/api/agents";
import { getSkills } from "@/api/skills";
import { listKnowledgeLibrary } from "@/api/knowledge";
import type { AgentClient } from "@/agent-client/runtime";
import type { Skill } from "@/features/pages/skills/types";
import type { AiAgent } from "@/features/pages/settings/agent/types";
import type { ChatContext, ChatMessage, ChatResources, TurnInput } from "../core";

export type ChatProfile = {
  id: string;
  systemPrompt(workspacePath: string): string;
  authorize?: () => Promise<void>;
  skills?: (Skill & { label?: string })[];
  skillGroup?: { label: string; description?: string };
  useKnowledge?: boolean;
  allowedToolNames?: string[];
  initialMessages?: ChatMessage[];
  context?: (turn: TurnInput, signal: AbortSignal) => Promise<ChatContext>;
};
export function createDesktopCatalog(client: AgentClient, readProfile: () => ChatProfile) {
  let skills: Skill[] = [];
  let agents: AiAgent[] = [];
  let resources: ChatResources = {};
  let inFlight: Promise<ChatResources> | undefined;
  let loadingProfile: ChatProfile | undefined;
  let loadingRefresh = false;
  return {
    getDetails: () => ({ skills, agents, resources }),
    load({ refresh = false }: { refresh?: boolean } = {}): Promise<ChatResources> {
      const profile = readProfile();
      if (inFlight)
        return loadingProfile === profile && (!refresh || loadingRefresh)
          ? inFlight
          : inFlight.then(
              () => this.load({ refresh }),
              () => this.load({ refresh }),
            );
      loadingProfile = profile;
      loadingRefresh = refresh;
      inFlight = (async () => {
        const results = await Promise.allSettled([
          getLlmModelOptions({ refresh }),
          getAiAgentSettings(),
          profile.skills ? Promise.resolve({ skills: profile.skills, groups: [], defaultGroupId: "" }) : getSkills(),
          profile.useKnowledge === false ? Promise.resolve({ collections: [], sources: [] }) : listKnowledgeLibrary(),
          client.capabilities.listAgentTools(),
        ]);
        const errors: NonNullable<ChatResources["errors"]> = {};
        const value = <T>(key: keyof typeof errors, result: PromiseSettledResult<T>, fallback: T): T => {
          if (result.status === "fulfilled") return result.value;
          errors[key] =
            `${{ models: "模型", agents: "角色", skillGroups: "技能", knowledgeCollections: "知识库", tools: "工具" }[key]}加载失败，可重试`;
          return fallback;
        };
        const models = value("models", results[0], []);
        const agentSettings = value("agents", results[1], { agents: [], collaborationWorkflows: [] });
        const skillSettings = value("skillGroups", results[2], { skills: [], groups: [], defaultGroupId: "" });
        const knowledge = value("knowledgeCollections", results[3], { collections: [], sources: [] });
        const toolSettings = value("tools", results[4], { tools: [], defaultToolNames: [], permissionOptions: [] });
        agents = agentSettings.agents;
        skills = profile.skills ?? skillSettings.skills;
        const skillMap = new Map(
          skills.map((skill) => [
            skill.key,
            {
              key: skill.key,
              name: skill.name,
              label: profile.skills?.find((item) => item.key === skill.key)?.label ?? skill.name,
              description: skill.description ?? "",
            },
          ]),
        );
        const groups = profile.skills
          ? [
              {
                id: profile.id,
                name: profile.skillGroup?.label ?? "场景技能",
                description: profile.skillGroup?.description ?? "",
                skills: profile.skills,
                isDefault: true,
              },
            ]
          : skillSettings.groups.map((group) => ({ ...group, isDefault: group.id === skillSettings.defaultGroupId }));
        resources = {
          permissionOptions: toolSettings.permissionOptions.map((option) => ({ ...option })),
          models: models.map((model, index) => ({
            value: model.id,
            label: `${model.provider.name}/${model.modelName}`,
            selectedLabel: model.modelName,
            thinking: model.thinking,
            description: `${model.provider.name} / ${model.modelName}`,
            isDefault: index === 0,
          })),
          agents: agents.map((agent) => ({
            value: agent.id,
            label: agent.name,
            description: agent.description ?? "",
            isDefault: false,
          })),
          skillGroups: groups.map((group) => ({
            value: group.id,
            label: group.name,
            description: group.description ?? "",
            isDefault: group.isDefault,
            skills: group.skills.flatMap((skill) => {
              const found = skillMap.get(skill.key);
              return found ? [found] : [];
            }),
          })),
          knowledgeCollections: knowledge.collections
            .filter((collection) => collection.enabled)
            .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
            .map((collection) => ({
              value: collection.id,
              label: collection.name,
              description: collection.description ?? collection.sourceDirectory ?? "",
              sourceDirectory: collection.sourceDirectory,
              isDefault: true,
            })),
          tools: toolSettings.tools
            .filter((tool) => !profile.allowedToolNames || profile.allowedToolNames.includes(tool.name))
            .map((tool) => ({
              value: tool.name,
              label: tool.label,
              description: tool.description ?? "",
              isDefault: profile.allowedToolNames ? true : toolSettings.defaultToolNames.includes(tool.name),
            })),
          errors,
        };
        return resources;
      })().finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    },
  };
}
