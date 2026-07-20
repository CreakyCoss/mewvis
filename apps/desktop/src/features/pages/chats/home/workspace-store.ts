import { create } from "zustand";
import { createAgentClient } from "@/agent-client/runtime";
import { getAiAgentSettings } from "@/api/agents";
import { getLlmSettings } from "@/api/llm";
import { getWorkspaceSkills } from "@/api/skills";
import {
  createWorkspace as createWorkspaceApi,
  listWorkspaces,
  updateWorkspace as updateWorkspaceApi,
} from "@/api/workspace";
import { buildRuntimeModelInputs, buildRuntimeModelOptions } from "@/features/pages/settings/llm/store/model";
import type { ChatInputResources } from "../components/chat-input/type";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  path: string;
  isDefault: boolean;
  isPinned: boolean;
  order: number;
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
};

type WorkspaceStore = {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  resources: ChatInputResources;
  isLoading: boolean;
  error: string;
  loadWorkspaces: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (input: { name: string; description: string; path: string }) => Promise<void>;
  updateWorkspace: (workspaceId: string, input: { name: string; description: string }) => Promise<void>;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : fallback;
};

const sortWorkspaces = (workspaces: Workspace[]) =>
  [...workspaces].sort(
    (left, right) =>
      Number(right.isPinned) - Number(left.isPinned) ||
      left.order - right.order ||
      left.name.localeCompare(right.name, "zh-CN"),
  );

const resolveCurrentWorkspace = (workspaces: Workspace[], currentWorkspace: Workspace | null) =>
  workspaces.find((workspace) => workspace.id === currentWorkspace?.id) ??
  workspaces.find((workspace) => workspace.isDefault) ??
  null;

const loadResources = async (workspaceId: string): Promise<ChatInputResources> => {
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

const fetchWorkspaces = async (currentWorkspace: Workspace | null, previousWorkspaceIds?: ReadonlySet<string>) => {
  const overview = await listWorkspaces();
  const workspaces = sortWorkspaces(
    overview.map((workspace) => (workspace.isDefault ? { ...workspace, name: "默认工作区" } : workspace)),
  );
  const createdWorkspace = previousWorkspaceIds
    ? workspaces
        .filter((workspace) => !workspace.isDefault && !previousWorkspaceIds.has(workspace.id))
        .sort((left, right) => right.createdAt - left.createdAt)[0]
    : null;
  const nextWorkspace = createdWorkspace ?? resolveCurrentWorkspace(workspaces, currentWorkspace);

  return {
    workspaces,
    currentWorkspace: nextWorkspace,
    resources: await loadResources(nextWorkspace?.id ?? ""),
  };
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  resources: {},
  isLoading: true,
  error: "",
  loadWorkspaces: async () => {
    set({ isLoading: true, error: "" });

    try {
      const result = await fetchWorkspaces(get().currentWorkspace);

      set({
        ...result,
        isLoading: false,
      });
    } catch (error) {
      set({
        workspaces: [],
        currentWorkspace: null,
        resources: {},
        isLoading: false,
        error: getErrorMessage(error, "工作区列表加载失败，请重试。"),
      });
    }
  },
  refreshWorkspaces: async () => {
    const previousWorkspaceIds = new Set(get().workspaces.map((workspace) => workspace.id));
    set({ isLoading: true, error: "" });

    try {
      const result = await fetchWorkspaces(get().currentWorkspace, previousWorkspaceIds);

      set({
        ...result,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: getErrorMessage(error, "工作区列表刷新失败，请重试。"),
      });
    }
  },
  createWorkspace: async (input) => {
    await createWorkspaceApi({
      name: input.name.trim(),
      description: input.description.trim(),
      path: input.path.trim(),
      groupId: "",
    });
    await get().refreshWorkspaces();
  },
  updateWorkspace: async (workspaceId, input) => {
    const workspace = get().workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error("工作区不存在");
    }

    await updateWorkspaceApi(workspaceId, {
      name: input.name.trim(),
      description: input.description.trim(),
      path: workspace.path,
      groupId: workspace.groupId ?? "",
    });
    await get().refreshWorkspaces();
  },
  setCurrentWorkspace: (workspace) => {
    set({
      currentWorkspace: workspace,
      resources: {},
      error: "",
    });
    void loadResources(workspace?.id ?? "").then((resources) => {
      if (get().currentWorkspace?.id === workspace?.id) {
        set({ resources });
      }
    });
  },
}));
