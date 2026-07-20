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
  setSelectedSkillKeys: (skillKeys: string[]) => void;
  setSelectedToolNames: (toolNames: string[]) => void;
  setShowThinkingProcess: (value: boolean) => void;
  setShowToolCallProcess: (value: boolean) => void;
};

type ChatInputStore = ChatInputOptionValues &
  ChatInputOptionValueSetters & {
    resources: ChatInputResources;
    initializeResources: (resources: ChatInputResources, defaultOptionValues?: Partial<ChatInputOptionValues>) => void;
    getOptionValues: () => ChatInputOptionValues;
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
    selectedSkillKeys:
      defaultOptionValues.selectedSkillKeys === undefined
        ? collectSkills(defaultSkillGroups).map((skill) => skill.key)
        : collectSkills(skillGroups)
            .filter((skill) => defaultOptionValues.selectedSkillKeys?.includes(skill.key))
            .map((skill) => skill.key),
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
  selectedSkillKeys: [],
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
  setSelectedSkillKeys: (skillKeys) => {
    const selectedKeys = new Set(skillKeys);
    const selectedSkills = collectSkills(get().resources.skillGroups ?? []).filter((skill) =>
      selectedKeys.has(skill.key),
    );

    set({ selectedSkillKeys: selectedSkills.map((skill) => skill.key) });
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
  getOptionValues: () => {
    const state = get();

    return {
      selectedModelId: state.selectedModelId,
      selectedAgentId: state.selectedAgentId,
      selectedSkillKeys: [...state.selectedSkillKeys],
      selectedToolNames: [...state.selectedToolNames],
      showThinkingProcess: state.showThinkingProcess,
      showToolCallProcess: state.showToolCallProcess,
    };
  },
  getSubmitResources: () => {
    const state = get();
    const model = state.resources.models?.find((option) => option.value === state.selectedModelId) ?? null;
    if (!model) {
      return null;
    }
    const agent = state.resources.agents?.find((option) => option.value === state.selectedAgentId) ?? null;
    const selectedSkillKeys = new Set(state.selectedSkillKeys);
    const skills = collectSkills(state.resources.skillGroups ?? []).filter((skill) => selectedSkillKeys.has(skill.key));
    const selectedToolNames = new Set(state.selectedToolNames);
    const tools = (state.resources.tools ?? [])
      .filter((tool) => selectedToolNames.has(tool.value))
      .map((tool) => tool.value);

    return {
      model: model.runtimeModel,
      agent: agent?.agent ?? null,
      skills,
      tools,
      showThinkingProcess: state.showThinkingProcess,
      showToolCallProcess: state.showToolCallProcess,
    };
  },
}));
