import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { isEqual } from "lodash-es";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
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
};

interface ChatInputStore extends ChatInputOptionValueSetters {
  resources: ChatInputResources;
  optionValues: ChatInputOptionValues;
  submitResources: ChatInputSubmitResources | null;
  initializeResources: (resources: ChatInputResources, defaultOptionValues?: Partial<ChatInputOptionValues>) => void;
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
  values: Partial<ChatInputOptionValues> = {},
  fallbackToResourceDefaults = false,
): Pick<ChatInputStore, "optionValues" | "submitResources"> => {
  const models = resources.models ?? [];
  const agents = resources.agents ?? [];
  const skillGroups = resources.skillGroups ?? [];
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
  const requestedToolNames = values.selectedToolNames ? new Set(values.selectedToolNames) : null;
  const selectedTools = requestedToolNames
    ? tools.filter((tool) => requestedToolNames.has(tool.value))
    : tools.filter((tool) => tool.isDefault);
  const optionValues: ChatInputOptionValues = {
    selectedModelId: selectedModel?.value ?? "",
    selectedAgentId: selectedAgent?.value ?? "",
    selectedSkillKeys: selectedSkills.map((skill) => skill.key),
    selectedToolNames: selectedTools.map((tool) => tool.value),
  };

  return {
    optionValues,
    submitResources: selectedModel
      ? {
          model: selectedModel.runtimeModel,
          agent: selectedAgent?.agent ?? null,
          skills: selectedSkills,
          tools: optionValues.selectedToolNames,
        }
      : null,
  };
};

const createChatInputStore = () =>
  createStore<ChatInputStore>()((set, get) => {
    const updateOptionValues = (updates: Partial<ChatInputOptionValues>) => {
      const state = get();
      const resolvedState = resolveChatInputState(state.resources, {
        ...state.optionValues,
        ...updates,
      });

      if (isEqual(state.optionValues, resolvedState.optionValues)) {
        return;
      }

      set(resolvedState);
    };

    return {
      resources: {},
      optionValues: {
        selectedModelId: "",
        selectedAgentId: "",
        selectedSkillKeys: [],
        selectedToolNames: [],
      },
      submitResources: null,
      initializeResources: (resources, defaultOptionValues) => {
        set({
          resources,
          ...resolveChatInputState(resources, defaultOptionValues, true),
        });
      },
      setSelectedModelId: (selectedModelId) => updateOptionValues({ selectedModelId }),
      setSelectedAgentId: (selectedAgentId) => updateOptionValues({ selectedAgentId }),
      setSelectedSkillKeys: (selectedSkillKeys) => updateOptionValues({ selectedSkillKeys }),
      setSelectedToolNames: (selectedToolNames) => updateOptionValues({ selectedToolNames }),
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
