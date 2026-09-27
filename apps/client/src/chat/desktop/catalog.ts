import { listExtensionCommands } from "@/api/agent-runtime";
import { listExtensions } from "@/api/extensions";
import { getLlmModelOptions } from "@/api/llm";
import { getAgentSettings } from "@/api/agents";
import { getSkills } from "@/api/skills";
import { listKnowledgeLibrary } from "@/api/knowledge";
import type { AgentClient } from "@/agent-client/runtime";
import type { Skill } from "@/workbench/pages/skills/types";
import type { AgentDefinition } from "@/workbench/pages/agents/types";
import type { ChatContext, ChatMessage, ChatResources, TurnInput } from "../core";

export type ChatProfile = {
  id: string;
  systemPrompt(workspacePath: string): string;
  authorize?: () => Promise<void>;
  skills?: (Skill & { label?: string })[];
  skillGroup?: { label: string; description?: string };
  useKnowledge?: boolean;
  allowedToolNames?: string[];
  resolveToolNames?: () => string[];
  toolCatalog?: () => Promise<{ name: string; label: string; description?: string }[]>;
  initialMessages?: ChatMessage[];
  context?: (turn: TurnInput, signal: AbortSignal) => Promise<ChatContext>;
};
export function createDesktopCatalog(
  client: AgentClient,
  readProfile: () => ChatProfile,
  target?: { workspacePath: string; chatId: string },
) {
  let skills: Skill[] = [];
  let agents: AgentDefinition[] = [];
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
          getAgentSettings(),
          profile.skills ? Promise.resolve({ skills: profile.skills, groups: [], defaultGroupId: "" }) : getSkills(),
          profile.useKnowledge === false ? Promise.resolve({ collections: [], sources: [] }) : listKnowledgeLibrary(),
          Promise.all([client.capabilities.listAgentTools(), profile.toolCatalog?.()]).then(([tools, catalog]) =>
            catalog ? { ...tools, tools: catalog } : tools,
          ),
          target ? listExtensionCommands(target) : Promise.resolve([]),
          target ? listExtensions() : Promise.resolve([]),
        ]);
        const errors: NonNullable<ChatResources["errors"]> = {};
        const value = <T>(key: keyof typeof errors, result: PromiseSettledResult<T>, fallback: T): T => {
          if (result.status === "fulfilled") return result.value;
          errors[key] =
            `${{ models: "模型", agents: "智能体", skillGroups: "技能", knowledgeCollections: "知识库", tools: "工具", commands: "插件命令" }[key]}加载失败，可重试`;
          return fallback;
        };
        const models = value("models", results[0], []);
        const agentSettings = value("agents", results[1], { agents: [] });
        const skillSettings = value("skillGroups", results[2], { skills: [], groups: [], defaultGroupId: "" });
        const knowledge = value("knowledgeCollections", results[3], { collections: [], sources: [] });
        const toolSettings = value("tools", results[4], { tools: [], defaultToolNames: [], permissionOptions: [] });
        const pluginNames = new Map(
          (results[6].status === "fulfilled" ? results[6].value : []).map(
            (extension) => [extension.id, extension.displayName] as const,
          ),
        );
        const allowedTools = profile.resolveToolNames?.() ?? profile.allowedToolNames;
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
          commands: value("commands", results[5], [])
            .filter((command) => command.inputMode === "text")
            .map(({ id, label, description }) => ({
              id,
              label,
              description,
              pluginName: pluginNames.get(id.slice(0, id.lastIndexOf("/"))) ?? "未命名插件",
            })),
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
            description: agent.summary,
            category: agent.category,
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
            .filter((tool) => !allowedTools || allowedTools.includes(tool.name))
            .map((tool) => ({
              value: tool.name,
              label: tool.label,
              description: tool.description ?? "",
              isDefault: allowedTools ? true : toolSettings.defaultToolNames.includes(tool.name),
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
