import { create } from "zustand";
import type {
  ChatInputOptionValues,
  ChatInputResources,
  ChatInputSkillGroupOption,
  ChatInputSubmitResources,
} from "./type";

type ChatInputOptionValueSetters = {
  setSelectedModelId: (modelId: string) => void;
  setSelectedAgentId: (agentId: string) => void;
  setSelectedSkillGroupIds: (skillGroupIds: string[]) => void;
  setSelectedToolNames: (toolNames: string[]) => void;
  setShowThinkingProcess: (value: boolean) => void;
  setShowToolCallProcess: (value: boolean) => void;
};

type ChatInputStore = ChatInputOptionValues &
  ChatInputOptionValueSetters & {
    resources: ChatInputResources;
    initializeResources: (resources: ChatInputResources, defaultOptionValues?: Partial<ChatInputOptionValues>) => void;
    getSubmitResources: () => ChatInputSubmitResources | null;
  };

const collectSkills = (skillGroups: ChatInputSkillGroupOption[]) => {
  const skillsByKey = new Map<string, ChatInputSubmitResources["skills"][number]>();

  skillGroups.forEach((group) => {
    group.skills.forEach((skill) => skillsByKey.set(skill.key, skill));
  });

  return [...skillsByKey.values()];
};

const getInitialOptionValues = (
  resources: ChatInputResources,
  defaultOptionValues: Partial<ChatInputOptionValues> = {},
): ChatInputOptionValues => {
  const models = resources.models ?? [];
  const agents = resources.agents ?? [];
  const skillGroups = resources.skillGroups ?? [];
  const defaultModel = models.find((model) => model.isDefault) ?? models[0] ?? null;
  const defaultAgent = agents.find((agent) => agent.isDefault) ?? null;
  const defaultSkillGroup = skillGroups.find((group) => group.isDefault);
  const defaultSkillGroups = defaultSkillGroup ? [defaultSkillGroup] : skillGroups;

  return {
    selectedModelId:
      models.find((model) => model.value === defaultOptionValues.selectedModelId)?.value ?? defaultModel?.value ?? "",
    selectedAgentId:
      defaultOptionValues.selectedAgentId === ""
        ? ""
        : (agents.find((agent) => agent.value === defaultOptionValues.selectedAgentId)?.value ??
          defaultAgent?.value ??
          ""),
    selectedSkillGroupIds:
      defaultOptionValues.selectedSkillGroupIds === undefined
        ? defaultSkillGroups.map((group) => group.value)
        : skillGroups
            .filter((group) => defaultOptionValues.selectedSkillGroupIds?.includes(group.value))
            .map((group) => group.value),
    selectedToolNames:
      defaultOptionValues.selectedToolNames === undefined
        ? (resources.tools ?? []).filter((tool) => tool.isDefault).map((tool) => tool.value)
        : (resources.tools ?? [])
            .filter((tool) => defaultOptionValues.selectedToolNames?.includes(tool.value))
            .map((tool) => tool.value),
    showThinkingProcess: defaultOptionValues.showThinkingProcess ?? true,
    showToolCallProcess: defaultOptionValues.showToolCallProcess ?? true,
  };
};

export const useChatInputStore = create<ChatInputStore>((set, get) => ({
  resources: {},
  selectedModelId: "",
  selectedAgentId: "",
  selectedSkillGroupIds: [],
  selectedToolNames: [],
  showThinkingProcess: true,
  showToolCallProcess: true,
  initializeResources: (resources, defaultOptionValues) => {
    set({
      resources,
      ...getInitialOptionValues(resources, defaultOptionValues),
    });
  },
  setSelectedModelId: (modelId) => {
    const selectedModel = get().resources.models?.find((model) => model.value === modelId) ?? null;

    set({ selectedModelId: selectedModel?.value ?? "" });
  },
  setSelectedAgentId: (agentId) => {
    const selectedAgent = get().resources.agents?.find((agent) => agent.value === agentId) ?? null;

    set({ selectedAgentId: selectedAgent?.value ?? "" });
  },
  setSelectedSkillGroupIds: (skillGroupIds) => {
    const selectedIds = new Set(skillGroupIds);
    const selectedSkillGroups = (get().resources.skillGroups ?? []).filter((group) => selectedIds.has(group.value));

    set({ selectedSkillGroupIds: selectedSkillGroups.map((group) => group.value) });
  },
  setSelectedToolNames: (toolNames) => {
    const selectedNames = new Set(toolNames);
    const selectedToolNames = (get().resources.tools ?? [])
      .filter((tool) => selectedNames.has(tool.value))
      .map((tool) => tool.value);

    set({ selectedToolNames });
  },
  setShowThinkingProcess: (showThinkingProcess) => set({ showThinkingProcess }),
  setShowToolCallProcess: (showToolCallProcess) => set({ showToolCallProcess }),
  getSubmitResources: () => {
    const state = get();
    const model = state.resources.models?.find((option) => option.value === state.selectedModelId) ?? null;
    if (!model) {
      return null;
    }
    const agent = state.resources.agents?.find((option) => option.value === state.selectedAgentId) ?? null;
    const selectedSkillGroupIds = new Set(state.selectedSkillGroupIds);
    const skillGroups = (state.resources.skillGroups ?? []).filter((group) => selectedSkillGroupIds.has(group.value));
    const selectedToolNames = new Set(state.selectedToolNames);
    const tools = (state.resources.tools ?? [])
      .filter((tool) => selectedToolNames.has(tool.value))
      .map((tool) => tool.value);

    return {
      model: model.runtimeModel,
      agent: agent?.agent ?? null,
      skills: collectSkills(skillGroups),
      tools,
      showThinkingProcess: state.showThinkingProcess,
      showToolCallProcess: state.showToolCallProcess,
    };
  },
}));
