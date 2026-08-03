import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { isEqual } from "lodash-es";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type {
  ChatInputInitialOptions,
  ChatInputOptions,
  ChatInputResources,
  ChatInputSkillGroupOption,
  ChatInputSubmitResources,
} from "./type";

interface ChatInputStore {
  resources: ChatInputResources;
  options: ChatInputOptions;
  submitResources: ChatInputSubmitResources | null;
  isInitialized: boolean;
  initializeResources: (resources: ChatInputResources, initialOptions?: ChatInputInitialOptions) => void;
  updateOptions: (updates: Partial<ChatInputOptions>) => void;
}

const collectSkills = (skillGroups: ChatInputSkillGroupOption[]) => {
  const skillsByKey = new Map<string, ChatInputSubmitResources["skills"][number]>();

  skillGroups.forEach((group) => {
    group.skills.forEach((skill) => skillsByKey.set(skill.key, skill));
  });

  return [...skillsByKey.values()];
};

const resolveChatInputState = (
  resources: ChatInputResources,
  values: ChatInputInitialOptions = {},
  fallbackToResourceDefaults = false,
): Pick<ChatInputStore, "options" | "submitResources"> => {
  const models = resources.models ?? [];
  const agents = resources.agents ?? [];
  const skillGroups = resources.skillGroups ?? [];
  const knowledgeCollections = resources.knowledgeCollections ?? [];
  const tools = resources.tools ?? [];
  const defaultModel = models.find((model) => model.isDefault) ?? models[0] ?? null;
  const defaultAgent = agents.find((agent) => agent.isDefault) ?? null;
  const defaultSkillGroup = skillGroups.find((group) => group.isDefault);
  const defaultSkillGroups = defaultSkillGroup ? [defaultSkillGroup] : skillGroups;
  const selectedModel =
    models.find((model) => model.value === values.selectedModelId) ??
    (fallbackToResourceDefaults ? defaultModel : null);
  const selectedAgent =
    values.selectedAgentId === ""
      ? null
      : (agents.find((agent) => agent.value === values.selectedAgentId) ??
        (fallbackToResourceDefaults ? defaultAgent : null));
  const availableSkills = collectSkills(skillGroups);
  const selectedSkillKeys = values.selectedSkillKeys ? new Set(values.selectedSkillKeys) : null;
  const selectedSkills = selectedSkillKeys
    ? availableSkills.filter((skill) => selectedSkillKeys.has(skill.key))
    : collectSkills(defaultSkillGroups);
  const requestedKnowledgeCollectionIds = values.selectedKnowledgeCollectionIds
    ? new Set(values.selectedKnowledgeCollectionIds)
    : null;
  const selectedKnowledgeCollections = requestedKnowledgeCollectionIds
    ? knowledgeCollections.filter((collection) => requestedKnowledgeCollectionIds.has(collection.value))
    : knowledgeCollections.filter((collection) => collection.isDefault);
  const requestedToolNames = values.selectedToolNames ? new Set(values.selectedToolNames) : null;
  const selectedTools = requestedToolNames
    ? tools.filter((tool) => requestedToolNames.has(tool.value))
    : tools.filter((tool) => tool.isDefault);
  const options: ChatInputOptions = {
    selectedModelId: selectedModel?.value ?? "",
    selectedAgentId: selectedAgent?.value ?? "",
    selectedSkillKeys: selectedSkills.map((skill) => skill.key),
    selectedKnowledgeCollectionIds: selectedKnowledgeCollections.map((collection) => collection.value),
    selectedToolNames: selectedTools.map((tool) => tool.value),
    showThinkingProcess: values.showThinkingProcess ?? true,
    showToolCallProcess: values.showToolCallProcess ?? true,
  };

  return {
    options,
    submitResources: selectedModel
      ? {
          model: selectedModel.runtimeModel,
          agent: selectedAgent?.agent ?? null,
          skills: selectedSkills,
          knowledgeCollections: selectedKnowledgeCollections,
          tools: options.selectedToolNames,
        }
      : null,
  };
};

const createChatInputStore = () =>
  createStore<ChatInputStore>()((set, get) => {
    const updateOptions = (updates: Partial<ChatInputOptions>) => {
      const state = get();
      const resolvedState = resolveChatInputState(state.resources, {
        ...state.options,
        ...updates,
      });

      if (isEqual(state.options, resolvedState.options)) {
        return;
      }

      set(resolvedState);
    };

    return {
      resources: {},
      options: {
        selectedModelId: "",
        selectedAgentId: "",
        selectedSkillKeys: [],
        selectedKnowledgeCollectionIds: [],
        selectedToolNames: [],
        showThinkingProcess: true,
        showToolCallProcess: true,
      },
      submitResources: null,
      isInitialized: false,
      initializeResources: (resources, initialOptions) => {
        set({
          resources,
          ...resolveChatInputState(resources, initialOptions, true),
          isInitialized: true,
        });
      },
      updateOptions,
    };
  });

const ChatInputStoreContext = createContext<ReturnType<typeof createChatInputStore> | null>(null);

export const ChatInputStoreProvider = ({ children }: PropsWithChildren) => {
  const [store] = useState(() => createChatInputStore());

  return <ChatInputStoreContext.Provider value={store}>{children}</ChatInputStoreContext.Provider>;
};

export const useChatInputStore = () => {
  const store = useContext(ChatInputStoreContext);
  if (!store) {
    throw new Error("useChatInputStore 必须在 ChatInputStoreProvider 内使用");
  }

  return useStore(store);
};
