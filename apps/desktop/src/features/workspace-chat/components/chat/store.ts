import { useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import { create } from "zustand";
import type { ChatMode, ContextWindowPreset, ModelSource } from "../../page-types";
import type { ChatPanelViewModel } from "./index";

const noop = () => {};
const noopAsync = async () => {};
const noopDispatch: Dispatch<SetStateAction<string>> = () => {};
const noopChatModeDispatch: Dispatch<SetStateAction<ChatMode>> = () => {};
const noopContextWindowPresetDispatch: Dispatch<SetStateAction<ContextWindowPreset>> = () => {};
const noopModelSourceDispatch: Dispatch<SetStateAction<ModelSource>> = () => {};

const emptyWorkspace = {
  id: "",
  name: "",
  description: null,
  path: "",
  isDefault: false,
  isPinned: false,
  order: 0,
  groupId: null,
  createdAt: 0,
  updatedAt: 0,
};

const emptyChatPanelState: ChatPanelViewModel = {
  chatScrollAreaRef: { current: null },
  workspace: emptyWorkspace,
  workspaces: [],
  messages: [],
  expandedThinkingIds: new Set(),
  expandedAgentEventIds: new Set(),
  modelSource: "agent",
  selectedAgent: null,
  chatError: "",
  settingsError: "",
  skillsError: "",
  sessionsError: "",
  pendingAgentQuestion: null,
  agentQuestionAnswer: "",
  customAgentQuestionAnswer: "",
  isAnsweringAgentQuestion: false,
  files: [],
  composerResetKey: 0,
  isSending: false,
  activeAgentTaskId: "",
  isSettingsLoading: false,
  chatMode: "agent",
  contextWindowPreset: "auto",
  effectiveContextWindow: 0,
  availableRuntimeAgents: [],
  selectedRuntimeAgent: null,
  runtimeAgentId: "",
  agentProfiles: [],
  providers: [],
  selectedProviderId: "",
  selectedModel: null,
  reviewerAgent: null,
  allowedAgentTools: [],
  toggleThinking: noop,
  toggleAgentEvents: noop,
  toggleAgentThinkingBlock: noop,
  toggleAgentBlock: noop,
  onEditHistoryMessage: noop,
  onDeleteHistoryMessage: noop,
  onMoveHistoryMessage: noop,
  onOpenWorkspace: noop,
  onCreateWorkspace: noop,
  answerAgentQuestion: noop,
  setAgentQuestionAnswer: noopDispatch,
  setCustomAgentQuestionAnswer: noopDispatch,
  submitAgentQuestionAnswer: noopAsync,
  setChatMode: noopChatModeDispatch,
  setContextWindowPreset: noopContextWindowPresetDispatch,
  setModelSource: noopModelSourceDispatch,
  setSelectedRuntimeAgentId: noopDispatch,
  setSelectedAgentId: noopDispatch,
  setSelectedReviewerAgentId: noopDispatch,
  setSelectedProviderId: noopDispatch,
  setSelectedModelId: noopDispatch,
  toggleAllowedAgentTool: noop,
  sendMessage: noopAsync,
  onAbortTask: noop,
};

type ChatPanelStore = ChatPanelViewModel & {
  setChatPanelState: (state: ChatPanelViewModel) => void;
  resetChatPanelState: () => void;
};

export const useChatPanelStore = create<ChatPanelStore>((set) => ({
  ...emptyChatPanelState,
  setChatPanelState: (state) => set(state),
  resetChatPanelState: () => set(emptyChatPanelState),
}));

export const useChatPanelStoreBridge = (state: ChatPanelViewModel) => {
  const setChatPanelState = useChatPanelStore((store) => store.setChatPanelState);

  useLayoutEffect(() => {
    setChatPanelState(state);
  });
};
