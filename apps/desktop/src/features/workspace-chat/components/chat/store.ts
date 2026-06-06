import { useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import { create } from "zustand";
import type { ChatExecutionMode, ChatMode, ContextWindowPreset, ModelSource } from "../../page-types";
import type { ChatPanelViewModel } from "./index";

const noop = () => {};
const noopAsync = async () => {};
const noopDispatch: Dispatch<SetStateAction<string>> = () => {};
const noopChatModeDispatch: Dispatch<SetStateAction<ChatMode>> = () => {};
const noopChatExecutionModeDispatch: Dispatch<SetStateAction<ChatExecutionMode>> = () => {};
const noopContextWindowPresetDispatch: Dispatch<SetStateAction<ContextWindowPreset>> = () => {};
const noopModelSourceDispatch: Dispatch<SetStateAction<ModelSource>> = () => {};
const noopBooleanDispatch: Dispatch<SetStateAction<boolean>> = () => {};

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
  modelSource: "direct",
  selectedAgent: null,
  chatError: "",
  settingsError: "",
  skillsError: "",
  sessionsError: "",
  pendingAgentQuestion: null,
  collaborationPlanDecision: null,
  agentQuestionAnswer: "",
  customAgentQuestionAnswer: "",
  isAnsweringAgentQuestion: false,
  files: [],
  composerResetKey: 0,
  isSending: false,
  activeAgentTaskId: "",
  isSettingsLoading: false,
  chatMode: "chat",
  chatExecutionMode: "agent",
  showThinkingProcess: true,
  showToolCallProcess: false,
  contextWindowPreset: "auto",
  effectiveContextWindow: 0,
  availableRuntimeAgents: [],
  selectedRuntimeAgent: null,
  runtimeAgentId: "",
  agentProfiles: [],
  providers: [],
  selectedProviderId: "",
  selectedModel: null,
  collaborationWorkflows: [],
  selectedCollaborationWorkflow: null,
  selectedCollaborationWorkflowId: "",
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
  resolveCollaborationPlanDecision: noop,
  setAgentQuestionAnswer: noopDispatch,
  setCustomAgentQuestionAnswer: noopDispatch,
  submitAgentQuestionAnswer: noopAsync,
  setChatMode: noopChatModeDispatch,
  setChatExecutionMode: noopChatExecutionModeDispatch,
  setShowThinkingProcess: noopBooleanDispatch,
  setShowToolCallProcess: noopBooleanDispatch,
  setContextWindowPreset: noopContextWindowPresetDispatch,
  setModelSource: noopModelSourceDispatch,
  setSelectedRuntimeAgentId: noopDispatch,
  setSelectedAgentId: noopDispatch,
  setSelectedCollaborationWorkflowId: noopDispatch,
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

const isSameChatPanelState = (
  current: ChatPanelViewModel,
  next: ChatPanelViewModel,
) => {
  const keys = Object.keys(next) as Array<keyof ChatPanelViewModel>;
  return keys.every((key) => Object.is(current[key], next[key]));
};

export const useChatPanelStore = create<ChatPanelStore>((set) => ({
  ...emptyChatPanelState,
  setChatPanelState: (state) => set((current) =>
    isSameChatPanelState(current, state) ? current : state,
  ),
  resetChatPanelState: () => set(emptyChatPanelState),
}));

export const useChatPanelStoreBridge = (state: ChatPanelViewModel) => {
  const setChatPanelState = useChatPanelStore((store) => store.setChatPanelState);

  useLayoutEffect(() => {
    setChatPanelState(state);
  });
};
