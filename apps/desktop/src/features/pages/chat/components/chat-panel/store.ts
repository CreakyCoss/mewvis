import { useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import { create } from "zustand";
import { ALL_SKILLS_GROUP_ID } from "@/features/pages/skills/constants";
import type { ChatPanelViewModel } from "./index";

const noop = () => {};
const noopAsync = async () => {};
const noopDispatch: Dispatch<SetStateAction<string>> = () => {};
const noopSkillGroupToggle = () => {};

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
  agentProfiles: [],
  runtimeModels: [],
  selectedRuntimeModelId: "",
  selectedRuntimeModel: null,
  agentTools: [],
  allowedAgentTools: [],
  skillGroups: [],
  defaultSkillGroupId: ALL_SKILLS_GROUP_ID,
  selectedSkillGroupIds: [ALL_SKILLS_GROUP_ID],
  selectedSkillGroupLabel: "全部",
  isResourceSelectionLocked: false,
  onEditHistoryMessage: noop,
  onDeleteHistoryMessage: noop,
  onMoveHistoryMessage: noop,
  onSubmitMessageToStory: null,
  storySubmittingMessageIds: [],
  onOpenWorkspace: noop,
  onCreateWorkspace: noop,
  setAgentQuestionAnswer: noopDispatch,
  setCustomAgentQuestionAnswer: noopDispatch,
  submitAgentQuestionAnswer: noopAsync,
  setSelectedAgentId: noopDispatch,
  setSelectedRuntimeModelId: noop,
  toggleAllowedAgentTool: noop,
  toggleSelectedSkillGroup: noopSkillGroupToggle,
  sendMessage: noopAsync,
  onAbortTask: noop,
};

type ChatPanelStore = ChatPanelViewModel & {
  setChatPanelState: (state: ChatPanelViewModel) => void;
  resetChatPanelState: () => void;
};

const isSameChatPanelState = (current: ChatPanelViewModel, next: ChatPanelViewModel) => {
  const keys = Object.keys(next) as Array<keyof ChatPanelViewModel>;
  return keys.every((key) => Object.is(current[key], next[key]));
};

export const useChatPanelStore = create<ChatPanelStore>((set) => ({
  ...emptyChatPanelState,
  setChatPanelState: (state) => set((current) => (isSameChatPanelState(current, state) ? current : state)),
  resetChatPanelState: () => set(emptyChatPanelState),
}));

export const useChatPanelStoreBridge = (state: ChatPanelViewModel) => {
  const setChatPanelState = useChatPanelStore((store) => store.setChatPanelState);
  const resetChatPanelState = useChatPanelStore((store) => store.resetChatPanelState);

  useLayoutEffect(() => {
    setChatPanelState(state);
  });

  useLayoutEffect(() => {
    return () => {
      resetChatPanelState();
    };
  }, [resetChatPanelState]);
};
