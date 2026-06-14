import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ALLOWED_RUNTIME_AGENT_TOOLS,
  normalizeAllowedRuntimeAgentTools,
  type RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import {
  agentContext,
} from "@/ai/agent-context";
import {
  buildAgentConversationContent,
  buildAgentExecutionSummary,
  createAgentMemoryTrace,
  type AgentMemoryTrace,
} from "@/ai/agent-runtime/memory";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import { CollaborationWorkflowSettingsDialog } from "@/features/ai/workflow/components/dialog";
import { AgentSettingsDialog } from "@/features/ai/agent/components/dialog";
import { SettingsPanel } from "@/features/app/settings";
import { LlmSettingsPage } from "@/features/ai/llm";
import { KnowledgeBasePage } from "@/features/knowledge-base/components/knowledge-base-page";
import { createGlobalKnowledgeRagIndex } from "@/features/knowledge-base/rag-index";
import { TavernPage } from "@/features/tavern/components/tavern-page";
import {
  ALL_SKILLS_GROUP_ID,
  NO_SKILLS_GROUP_ID,
} from "@/features/skills/constants";
import { SkillsPage } from "@/features/skills/components/page";
import type { SidebarProps } from "@/features/workspace/shell/sidebar";
import type { WorkbenchHeaderProps } from "@/features/workspace/shell/workbench-header";
import type { Workspace, WorkspaceSection } from "@/features/workspace/types";
import {
  cleanupOrphanAgentSessions,
  getAgentSessionStatus,
  readWorkspaceFile,
  resetAgentSessionsForChat,
  saveChatSession,
} from "../../api";
import type {
  ChatExecutionMode,
  ChatMode,
  CollaborationPhase,
  CollaborationPlanDecisionRequest,
  ContextDebugPayload,
  ContextDebugSnapshot,
  ComposerSubmitInput,
  PendingAgentQuestion,
  ResolvedFileReference,
  WorkspaceView,
} from "../../page-types";
import type {
  AgentSessionStatus,
  ChatContextSummary,
  ChatMessage,
  ChatSessionMeta,
  ConversationMessage,
} from "../../types";
import {
  readPreferredContextEngineId,
  writePreferredContextEngineId,
} from "./context-engine-preference";
import {
  type RunningAgentTaskContext,
} from "./agent-task";
import {
  findLatestAgentExecutionSummary,
  keepHistoryThroughMessage,
  moveHistoryItem,
  rebuildConversationFromVisibleMessages,
  removeHistoryMessageSegment,
  stripHiddenAgentContextMetadata,
  upsertChatSessionMeta,
} from "./history";
import {
  contextCompressionTraceStep,
  didConversationContextCompress,
  formatDebugMessages,
  formatKnowledgeMatches,
} from "./trace";
import {
  type ChatTurnDraft,
  createChatTurnDraft,
  validateComposerSubmit,
} from "./chat-turn";
import {
  createChatSessionId,
  createMessageId,
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
} from "../../utils/sessions";
import {
  isAgentTaskMode,
} from "../../utils/chat-mode";
import {
  runAgentTurn,
} from "./modes/agent-mode-runner";
import {
  runChatTurn,
} from "./modes/chat-mode-runner";
import {
  runCollaborationTurn,
} from "./modes/collaboration-mode-runner";
import type {
  FinalizeAssistantTurn,
  LimitsForProvider,
  PrepareChatTurnRuntimeInput,
  PreparedChatTurnRuntime,
  PublishContextDebugSnapshot,
} from "./modes/types";
import { ContextWorkbenchDialog } from "../context-workbench/dialog";
import { ChatPanel } from "../chat";
import { useChatPanelStoreBridge } from "../chat/store";
import { ContextPanel } from "../context-panel";
import { useContextPanelStoreBridge } from "../context-panel/store";
import { FilePanel } from "../file-workbench";
import { useAgentBlockState } from "./use-agent-block-state";
import { useAgentRuntimeEvents } from "./use-agent-runtime-events";
import { useContextModeling } from "./use-context-modeling";
import { useFileWorkbench } from "./use-file-workbench";
import { useModelSettings } from "./use-model-settings";
import { useRunningAgentTasks } from "./use-running-agent-tasks";
import { useChatTraceState } from "./use-chat-trace-state";
import { useWorkspaceChatSessions } from "./use-workspace-chat-sessions";
import { useWorkspaceSkills } from "./use-workspace-skills";
import { useWorkspaceVersionControl } from "./use-workspace-version-control";

const {
  createSession: createAgentContextSession,
  getContextEngineDescriptor,
  listContextEngineDescriptors,
} = agentContext;

type WorkspaceChatPageProps = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  isWorkspaceOverviewLoading: boolean;
  workspaceOverviewError: string;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
  renderShell: (props: WorkspaceChatShellProps) => ReactNode;
};

export type WorkspaceChatShellProps = {
  dialogs: ReactNode;
  sidebarProps: SidebarProps | null;
  headerProps: WorkbenchHeaderProps | null;
  content: ReactNode;
  contextPanel: ReactNode;
  isTavernImmersive: boolean;
};

const resolveStringStateAction = (
  action: SetStateAction<string>,
  previous: string,
) => typeof action === "function" ? action(previous) : action;

const defaultToolCallProcessByMode: Record<ChatMode, boolean> = {
  chat: true,
  agent: true,
  collab: true,
};

const specialSkillGroupIds = new Set([
  ALL_SKILLS_GROUP_ID,
  NO_SKILLS_GROUP_ID,
]);

const defaultSkillGroupSelection = (defaultSkillGroupId: string) => [
  defaultSkillGroupId || ALL_SKILLS_GROUP_ID,
];

const uniqueSkillGroupIds = (ids: string[]) => [...new Set(ids.filter(Boolean))];

const normalizeSkillGroupSelection = (ids: string[]) => {
  const uniqueIds = uniqueSkillGroupIds(ids);
  if (uniqueIds.includes(NO_SKILLS_GROUP_ID)) {
    return [NO_SKILLS_GROUP_ID];
  }
  if (uniqueIds.includes(ALL_SKILLS_GROUP_ID)) {
    return [ALL_SKILLS_GROUP_ID];
  }
  return uniqueIds.length > 0 ? uniqueIds : [NO_SKILLS_GROUP_ID];
};

const toggleSkillGroupSelection = (
  current: string[],
  skillGroupId: string,
  checked: boolean,
) => {
  if (checked) {
    if (specialSkillGroupIds.has(skillGroupId)) {
      return [skillGroupId];
    }
    return normalizeSkillGroupSelection([
      ...current.filter((id) => !specialSkillGroupIds.has(id)),
      skillGroupId,
    ]);
  }

  const next = current.filter((id) => id !== skillGroupId);
  return normalizeSkillGroupSelection(next);
};

type CommitChatTurnDraftInput = Pick<
  ChatTurnDraft,
  "nextConversation" | "userUiMessage" | "traceTurn"
> & {
  assistantUiMessage?: ChatMessage | null;
  nextSessionId: string | null;
};

export const WorkspaceChatPage = ({
  workspace,
  workspaceSections,
  isWorkspaceOverviewLoading,
  workspaceOverviewError,
  onOpenWorkspace,
  onCreateWorkspace,
  onEditWorkspace,
  renderShell,
}: WorkspaceChatPageProps) => {
  const agentRuntime = useMemo(() => createAgentRuntime(), []);
  const availableContextEngines = useMemo(() => listContextEngineDescriptors(), []);
  const [contextEngineId, setContextEngineId] = useState(readPreferredContextEngineId);
  const contextEngineDescriptor = useMemo(
    () => getContextEngineDescriptor(contextEngineId),
    [contextEngineId],
  );
  const preferredContextEngineIdRef = useRef(contextEngineId);
  const knowledgeRagIndex = useMemo(() => createGlobalKnowledgeRagIndex(), []);
  const activeAgentTaskIdRef = useRef("");
  const activeAgentMessageIdRef = useRef("");
  const activeAgentSessionIdRef = useRef("");
  const activeAgentIdRef = useRef("");
  const lastAgentErrorRef = useRef("");
  const lastAgentStderrRef = useRef("");
  const handledAgentDoneTaskIdsRef = useRef<Set<string>>(new Set());
  const activeAgentTraceRef = useRef<AgentMemoryTrace>(createAgentMemoryTrace());
  const agentContextInvalidatedRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationRef = useRef<ConversationMessage[]>([]);
  const conversationContextRef = useRef<ChatContextSummary | null>(null);
  const contextSessionRef = useRef(createAgentContextSession({
    engineId: contextEngineId,
  }));
  const currentSessionIdRef = useRef<string | null>(null);
  const currentSessionTitleRef = useRef(DEFAULT_SESSION_TITLE);
  const pendingAgentQuestionRef = useRef<PendingAgentQuestion | null>(null);
  const agentQuestionAnswerRef = useRef("");
  const customAgentQuestionAnswerRef = useRef("");
  const answeringAgentQuestionIdsRef = useRef<Set<string>>(new Set());
  const agentSessionResetPromiseRef = useRef<Promise<boolean> | null>(null);
  const collaborationPlanDecisionResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const chatScrollSnapshotRef = useRef<{
    lastMessageId: string | null;
    messageCount: number;
    pendingQuestionId: string | null;
  }>({
    lastMessageId: null,
    messageCount: 0,
    pendingQuestionId: null,
  });
  const agentSessionStatusRequestIdRef = useRef(0);
  const loadVersionControlRef = useRef<((historyBranchOverride?: string) => Promise<void>) | null>(null);
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [chatError, setChatError] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
  const [chatExecutionMode, setChatExecutionMode] = useState<ChatExecutionMode>("agent");
  const [showThinkingProcess, setShowThinkingProcess] = useState(true);
  const [toolCallProcessByMode, setToolCallProcessByMode] = useState<Record<ChatMode, boolean>>({
    ...defaultToolCallProcessByMode,
  });
  const showToolCallProcess = toolCallProcessByMode[chatMode] ?? defaultToolCallProcessByMode[chatMode];
  const setShowToolCallProcess = useCallback<Dispatch<SetStateAction<boolean>>>((value) => {
    setToolCallProcessByMode((current) => {
      const currentValue = current[chatMode] ?? defaultToolCallProcessByMode[chatMode];
      const nextValue = typeof value === "function" ? value(currentValue) : value;

      if (currentValue === nextValue) {
        return current;
      }

      return {
        ...current,
        [chatMode]: nextValue,
      };
    });
  }, [chatMode]);
  const [allowedAgentTools, setAllowedAgentTools] = useState<RuntimeAgentToolName[]>(() => [
    ...DEFAULT_ALLOWED_RUNTIME_AGENT_TOOLS,
  ]);
  const [selectedSkillGroupIds, setSelectedSkillGroupIds] = useState<string[]>([
    ALL_SKILLS_GROUP_ID,
  ]);
  const skillGroupSelectionTouchedRef = useRef(false);
  const skillGroupWorkspaceRef = useRef(workspace.id);
  const [, setCollaborationPhase] = useState<CollaborationPhase>("idle");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [isTavernRoomImmersive, setIsTavernRoomImmersive] = useState(false);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [isContextWorkbenchOpen, setIsContextWorkbenchOpen] = useState(false);
  const [isLlmSettingsOpen, setIsLlmSettingsOpen] = useState(false);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const [isCollaborationWorkflowSettingsOpen, setIsCollaborationWorkflowSettingsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeAgentTaskId, setActiveAgentTaskId] = useState("");
  const [pendingAgentQuestion, setPendingAgentQuestion] = useState<PendingAgentQuestion | null>(null);
  const [collaborationPlanDecision, setCollaborationPlanDecision] =
    useState<CollaborationPlanDecisionRequest | null>(null);
  const [agentQuestionAnswer, setAgentQuestionAnswer] = useState("");
  const [customAgentQuestionAnswer, setCustomAgentQuestionAnswer] = useState("");
  const [isAnsweringAgentQuestion, setIsAnsweringAgentQuestion] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationContext, setConversationContext] = useState<ChatContextSummary | null>(null);
  const [contextDebugSnapshot, setContextDebugSnapshot] = useState<ContextDebugSnapshot | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState(DEFAULT_SESSION_TITLE);
  const [agentRuntimeSessionId, setAgentRuntimeSessionId] = useState<string | null>(null);
  const [agentSessionStatus, setAgentSessionStatus] = useState<AgentSessionStatus | null>(null);
  const [agentSessionError, setAgentSessionError] = useState("");
  const [isAgentSessionLoading, setIsAgentSessionLoading] = useState(false);
  const [isContextCompressing, setIsContextCompressing] = useState(false);
  const {
    runtimeModels,
    selectedRuntimeModelId,
    setSelectedRuntimeModelId,
    modelSource,
    setModelSource,
    setSelectedAgentId,
    settingsError,
    setSettingsError,
    isSettingsLoading,
    selectedRuntimeModel,
    availableRuntimeAgents,
    selectedRuntimeAgent,
    setSelectedRuntimeAgentId,
    runtimeAgentId,
    runtimeAgentRequiresModel,
    agentProfiles,
    collaborationWorkflows,
    selectedCollaborationWorkflow,
    selectedCollaborationWorkflowId,
    setSelectedCollaborationWorkflowId,
    selectedAgent,
    effectiveRuntimeModel,
    loadLlmOptions,
  } = useModelSettings({
    agentRuntime,
    chatMode,
    chatExecutionMode,
  });
  useEffect(() => {
    if (chatMode === "collab" && collaborationWorkflows.length === 0) {
      setChatMode("chat");
    }
  }, [chatMode, collaborationWorkflows.length, setChatMode]);
  const tavernDefaultRuntimeModel = useMemo(
    () => runtimeModels[0] ?? null,
    [runtimeModels],
  );
  const {
    contextModelFor,
    effectiveAppContextWindow,
    summarizerFor,
  } = useContextModeling({
    runtimeAgentRequiresModel,
    effectiveRuntimeModel,
  });
  const {
    skills,
    skillGroups,
    skillsError,
    isSkillsLoading,
    isSkillsSaving,
    isSkillMarketplaceSearching,
    isSkillMarketplaceLoadingMore,
    isSkillInstalling,
    isSkillRemoving,
    defaultSkillGroupId,
    updateSkillGroups,
    updateDefaultSkillGroup,
    searchMarketplace,
    installMarketplaceSkill,
    removeMarketplaceSkill,
  } = useWorkspaceSkills({
    workspaceId: workspace.id,
  });
  const availableSkillGroupIds = useMemo(
    () => new Set(skillGroups.map((group) => group.id)),
    [skillGroups],
  );
  const resolvedDefaultSkillGroupIds = useMemo(() => {
    const defaultSelection = defaultSkillGroupSelection(defaultSkillGroupId);
    const [defaultId] = defaultSelection;
    return specialSkillGroupIds.has(defaultId) || availableSkillGroupIds.has(defaultId)
      ? defaultSelection
      : [ALL_SKILLS_GROUP_ID];
  }, [availableSkillGroupIds, defaultSkillGroupId]);
  const selectedSkillGroups = useMemo(
    () => selectedSkillGroupIds
      .map((id) => skillGroups.find((group) => group.id === id) ?? null)
      .filter((group) => group !== null),
    [selectedSkillGroupIds, skillGroups],
  );
  const selectedSkillGroupLabel = useMemo(() => {
    if (selectedSkillGroupIds.includes(NO_SKILLS_GROUP_ID)) {
      return "不使用技能";
    }
    if (selectedSkillGroupIds.includes(ALL_SKILLS_GROUP_ID)) {
      return "全部";
    }

    const groupNames = selectedSkillGroups.map((group) => group.name);
    if (groupNames.length === 0) {
      return "不使用技能";
    }
    if (groupNames.length <= 2) {
      return groupNames.join("、");
    }

    return `${groupNames.slice(0, 2).join("、")} 等 ${groupNames.length} 组`;
  }, [selectedSkillGroupIds, selectedSkillGroups]);
  const activeSkills = useMemo(() => {
    if (selectedSkillGroupIds.includes(NO_SKILLS_GROUP_ID)) {
      return [];
    }
    if (selectedSkillGroupIds.includes(ALL_SKILLS_GROUP_ID)) {
      return skills;
    }
    const skillKeys = new Set(
      selectedSkillGroups.flatMap((group) => group.skillNames),
    );
    return skills.filter((skill) => skillKeys.has(skill.key));
  }, [selectedSkillGroupIds, selectedSkillGroups, skills]);
  const activeSkillNames = useMemo(
    () => activeSkills.map((skill) => skill.name).sort(),
    [activeSkills],
  );
  useEffect(() => {
    if (skillGroupWorkspaceRef.current !== workspace.id) {
      skillGroupWorkspaceRef.current = workspace.id;
      skillGroupSelectionTouchedRef.current = false;
    }
    if (!skillGroupSelectionTouchedRef.current) {
      setSelectedSkillGroupIds(resolvedDefaultSkillGroupIds);
    }
  }, [resolvedDefaultSkillGroupIds, workspace.id]);
  useEffect(() => {
    const validSkillGroupIds = selectedSkillGroupIds.filter((id) =>
      specialSkillGroupIds.has(id) || availableSkillGroupIds.has(id)
    );
    if (validSkillGroupIds.length === selectedSkillGroupIds.length) {
      return;
    }

    if (validSkillGroupIds.length === 0) {
      skillGroupSelectionTouchedRef.current = false;
      setSelectedSkillGroupIds(resolvedDefaultSkillGroupIds);
      return;
    }

    setSelectedSkillGroupIds(normalizeSkillGroupSelection(validSkillGroupIds));
  }, [
    availableSkillGroupIds,
    resolvedDefaultSkillGroupIds,
    selectedSkillGroupIds,
  ]);
  const {
    files,
    activeFile,
    setActiveFile,
    filePath,
    setFilePath,
    fileContent,
    setFileContent,
    fileError,
    setFileError,
    fileViewMode,
    setFileViewMode,
    filePreviewMode,
    setFilePreviewMode,
    isFilesLoading,
    expandedFileTreePaths,
    isFileSaving,
    isFileDeleting,
    fileTree,
    isMarkdownFile,
    loadFiles,
    openFile,
    prepareNewFile,
    saveFile,
    deleteFile,
    toggleFileTreeDirectory,
  } = useFileWorkbench({
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    loadVersionControlRef,
    onWorkspaceViewChange: setWorkspaceView,
  });

  const {
    versionStatus,
    versions,
    versionDiff,
    selectedVersionFilePath,
    selectedHistoryVersionId,
    selectedVersionHistoryBranchName,
    versionFiles,
    selectedVersionSnapshotFilePath,
    historyVersionDiff,
    versionMessage,
    setVersionMessage,
    versionError,
    isVersionControlLoading,
    isVersionControlInitializing,
    isVersionDiffLoading,
    isVersionFilesLoading,
    isVersionFileContentLoading,
    isCreatingVersion,
    isVersionHistoryLoading,
    restoringVersionFilePath,
    isCreatingVersionBranch,
    switchingVersionBranchName,
    discardingVersionFilePath,
    loadVersionControl,
    initializeVersionControl,
    selectVersionFile,
    selectHistoryVersion,
    selectVersionHistoryBranch,
    selectHistoryVersionFile,
    createVersion,
    discardVersionFileChanges,
    restoreHistoryVersionFile,
    createVersionBranch,
    switchVersionBranch,
  } = useWorkspaceVersionControl({
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    activeFile,
    loadFiles,
    loadVersionControlRef,
    setActiveFile,
    setFilePath,
    setFileContent,
    setFileError,
    setFileViewMode,
    setFilePreviewMode,
    setWorkspaceView,
  });

  const {
    runningAgentTasksRef,
    visibleActiveAgentTaskId,
    isAgentTaskRunningForSession,
    addRunningAgentTask,
    removeRunningAgentTask,
  } = useRunningAgentTasks({
    workspacePath: workspace.path,
    currentSessionId,
    activeAgentTaskId,
  });

  const {
    chatTrace,
    chatTraceRef,
    replaceChatTrace,
    appendVisibleTraceStep,
    patchVisibleTraceTurn,
    appendRunningAgentTaskTraceStep,
    patchRunningAgentTaskTraceTurn,
    clearChatTrace,
  } = useChatTraceState({
    workspacePath: workspace.path,
    currentSessionIdRef,
    runningAgentTasksRef,
  });

  const closeSettingsAndContextPanels = useCallback(() => {
    setWorkspaceView("chat");
    setIsContextWorkbenchOpen(false);
    setIsLlmSettingsOpen(false);
    setIsAgentSettingsOpen(false);
    setIsCollaborationWorkflowSettingsOpen(false);
  }, []);

  const openSettingsPanel = useCallback(() => {
    setIsContextWorkbenchOpen(false);
    setIsLlmSettingsOpen(false);
    setWorkspaceView("settings");
  }, []);

  const openSkillsPage = useCallback(() => {
    setIsContextWorkbenchOpen(false);
    setIsLlmSettingsOpen(false);
    setIsAgentSettingsOpen(false);
    setIsCollaborationWorkflowSettingsOpen(false);
    setWorkspaceView("skills");
  }, []);

  const openContextWorkbench = useCallback(() => {
    setWorkspaceView("chat");
    setIsLlmSettingsOpen(false);
    setIsAgentSettingsOpen(false);
    setIsContextWorkbenchOpen(true);
  }, []);

  const handleContextWorkbenchOpenChange = useCallback((open: boolean) => {
    setIsContextWorkbenchOpen(open);
    if (open) {
      setWorkspaceView("chat");
      setIsLlmSettingsOpen(false);
      setIsAgentSettingsOpen(false);
      setIsCollaborationWorkflowSettingsOpen(false);
    }
  }, []);

  const updateMessage = useCallback((
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((current) => {
      const next = current.map((message) => message.id === messageId ? updater(message) : message);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      const next = [...current, message];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const requestCollaborationPlanDecision = useCallback((
    request: Omit<CollaborationPlanDecisionRequest, "id">,
  ) => new Promise<boolean>((resolve) => {
    collaborationPlanDecisionResolverRef.current = resolve;
    setCollaborationPlanDecision({
      ...request,
      id: crypto.randomUUID(),
    });
  }), []);

  const resolveCollaborationPlanDecision = useCallback((approved: boolean) => {
    collaborationPlanDecisionResolverRef.current?.(approved);
    collaborationPlanDecisionResolverRef.current = null;
    setCollaborationPlanDecision(null);
  }, []);

  const applyAgentQuestionDraft = useCallback((
    question: PendingAgentQuestion | null,
    answer = "",
    customAnswer = "",
  ) => {
    pendingAgentQuestionRef.current = question;
    agentQuestionAnswerRef.current = answer;
    customAgentQuestionAnswerRef.current = customAnswer;
    setPendingAgentQuestion(question);
    setAgentQuestionAnswer(answer);
    setCustomAgentQuestionAnswer(customAnswer);
  }, []);

  const updateCurrentAgentQuestionTaskDraft = useCallback((
    patch: Partial<Pick<RunningAgentTaskContext, "questionAnswer" | "customQuestionAnswer">>,
  ) => {
    const question = pendingAgentQuestionRef.current;
    if (!question) {
      return;
    }

    const task = runningAgentTasksRef.current.get(question.taskId);
    if (task?.pendingQuestion?.questionId !== question.questionId) {
      return;
    }

    Object.assign(task, patch);
  }, []);

  const setAgentQuestionAnswerDraft = useCallback<Dispatch<SetStateAction<string>>>((action) => {
    const nextAnswer = resolveStringStateAction(action, agentQuestionAnswerRef.current);
    agentQuestionAnswerRef.current = nextAnswer;
    setAgentQuestionAnswer(nextAnswer);
    updateCurrentAgentQuestionTaskDraft({ questionAnswer: nextAnswer });
  }, [updateCurrentAgentQuestionTaskDraft]);

  const setCustomAgentQuestionAnswerDraft = useCallback<Dispatch<SetStateAction<string>>>((action) => {
    const nextAnswer = resolveStringStateAction(action, customAgentQuestionAnswerRef.current);
    customAgentQuestionAnswerRef.current = nextAnswer;
    setCustomAgentQuestionAnswer(nextAnswer);
    updateCurrentAgentQuestionTaskDraft({ customQuestionAnswer: nextAnswer });
  }, [updateCurrentAgentQuestionTaskDraft]);

  const clearAgentQuestionDraft = useCallback(() => {
    applyAgentQuestionDraft(null);
  }, [applyAgentQuestionDraft]);

  const activateAgentTaskId = useCallback((taskId: string) => {
    activeAgentTaskIdRef.current = taskId;
    setActiveAgentTaskId(taskId);
  }, []);

  const resetActiveAgentTaskState = useCallback((
    options: {
      clearQuestion?: boolean;
      clearSession?: boolean;
      clearTerminalState?: boolean;
      resetTrace?: boolean;
    } = {},
  ) => {
    const {
      clearQuestion = true,
      clearSession = true,
      clearTerminalState = false,
      resetTrace = true,
    } = options;

    activeAgentTaskIdRef.current = "";
    activeAgentMessageIdRef.current = "";
    if (clearSession) {
      activeAgentSessionIdRef.current = "";
      activeAgentIdRef.current = "";
    }
    if (resetTrace) {
      activeAgentTraceRef.current = createAgentMemoryTrace();
    }
    if (clearTerminalState) {
      lastAgentErrorRef.current = "";
      lastAgentStderrRef.current = "";
    }
    if (clearQuestion) {
      clearAgentQuestionDraft();
    }
    setActiveAgentTaskId("");
  }, [clearAgentQuestionDraft]);

  const applyActiveAgentTaskState = useCallback((
    task: RunningAgentTaskContext,
    options: { restoreTerminalState?: boolean } = {},
  ) => {
    const { restoreTerminalState = true } = options;

    activeAgentTaskIdRef.current = task.taskId;
    activeAgentMessageIdRef.current = task.messageId;
    activeAgentSessionIdRef.current = task.agentSessionId;
    activeAgentIdRef.current = task.agentId;
    activeAgentTraceRef.current = task.trace;
    if (restoreTerminalState) {
      lastAgentErrorRef.current = task.lastError;
      lastAgentStderrRef.current = task.lastStderr;
    }
    applyAgentQuestionDraft(
      task.pendingQuestion,
      task.questionAnswer,
      task.customQuestionAnswer,
    );
    setAgentRuntimeSessionId(task.agentSessionId);
    setActiveAgentTaskId(task.taskId);
  }, [applyAgentQuestionDraft]);

  const prepareActiveAgentRun = useCallback(({
    messageId,
    agentSessionId,
    agentId,
    trace,
  }: {
    messageId: string;
    agentSessionId: string;
    agentId: string;
    trace: AgentMemoryTrace;
  }) => {
    activeAgentMessageIdRef.current = messageId;
    activeAgentSessionIdRef.current = agentSessionId;
    activeAgentIdRef.current = agentId;
    activeAgentTraceRef.current = trace;
    lastAgentErrorRef.current = "";
    lastAgentStderrRef.current = "";
    setAgentRuntimeSessionId(agentSessionId);
  }, []);
  const {
    expandedThinkingIds,
    expandedAgentEventIds,
    clearExpandedAgentBlocks,
    toggleThinking,
    toggleAgentEvents,
    toggleAgentThinkingBlock,
    toggleAgentBlock,
    scheduleAgentBlockCollapse,
  } = useAgentBlockState({
    messages,
    updateMessage,
  });

  const restoreRunningAgentTaskView = useCallback((task: RunningAgentTaskContext) => {
    if (!task.messages.some((message) => message.id === task.messageId)) {
      return false;
    }

    messagesRef.current = task.messages;
    conversationRef.current = task.conversation;
    conversationContextRef.current = task.context;
    const nextContextEngineId = getContextEngineDescriptor(
      task.context?.engine?.id ?? preferredContextEngineIdRef.current,
    ).id;
    contextSessionRef.current.set({
      engineId: nextContextEngineId,
      context: task.context,
    });
    setMessages(task.messages);
    setConversation(task.conversation);
    setConversationContext(task.context);
    setContextEngineId(nextContextEngineId);
    const nextTitle = task.title || deriveSessionTitle(task.messages);
    currentSessionTitleRef.current = nextTitle;
    setCurrentSessionTitle(nextTitle);
    applyActiveAgentTaskState(task);
    return true;
  }, [applyActiveAgentTaskState]);

  const detachActiveAgentTask = useCallback(() => {
    const currentTaskId = activeAgentTaskIdRef.current;
    const currentTask = currentTaskId
      ? runningAgentTasksRef.current.get(currentTaskId)
      : null;
    if (
      currentTask &&
      currentTask.workspacePath === workspace.path &&
      currentTask.sessionId === currentSessionIdRef.current &&
      messagesRef.current.some((message) => message.id === currentTask.messageId)
    ) {
      currentTask.title = currentSessionTitleRef.current;
      currentTask.messages = messagesRef.current;
      currentTask.conversation = conversationRef.current;
      currentTask.context = contextSessionRef.current.get();
      currentTask.pendingQuestion =
        pendingAgentQuestionRef.current?.taskId === currentTaskId
          ? pendingAgentQuestionRef.current
          : null;
      currentTask.questionAnswer = agentQuestionAnswerRef.current;
      currentTask.customQuestionAnswer = customAgentQuestionAnswerRef.current;
    }

    resetActiveAgentTaskState({ clearTerminalState: true });
  }, [resetActiveAgentTaskState, workspace.path]);

  const getChatScrollViewport = useCallback(() =>
    chatScrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']",
    ) ?? null, []);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const scroll = () => {
      const viewport = getChatScrollViewport();
      if (!viewport) {
        return;
      }

      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      });
      if (behavior === "auto") {
        viewport.scrollTop = viewport.scrollHeight;
      }
    };

    window.requestAnimationFrame(() => {
      scroll();
      window.requestAnimationFrame(scroll);
    });
  }, [getChatScrollViewport]);

  const scrollActiveThinkingToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      const thinkingBlocks = chatScrollAreaRef.current?.querySelectorAll<HTMLElement>(
        "[data-agent-thinking-content='true']",
      );
      const latestThinkingBlock = thinkingBlocks?.item(thinkingBlocks.length - 1);
      if (latestThinkingBlock) {
        latestThinkingBlock.scrollTop = latestThinkingBlock.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    const viewport = getChatScrollViewport();
    const content = viewport?.firstElementChild;
    if (!viewport || !(content instanceof HTMLElement)) {
      return undefined;
    }

    let frameId: number | null = null;
    const scrollToPinnedBottom = () => {
      frameId = null;
      viewport.scrollTop = viewport.scrollHeight;
      scrollActiveThinkingToBottom();
    };
    const schedulePinnedScroll = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(scrollToPinnedBottom);
      }
    };

    const observer = new ResizeObserver(schedulePinnedScroll);
    observer.observe(content);
    observer.observe(viewport);
    schedulePinnedScroll();

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    getChatScrollViewport,
    messages.length,
    pendingAgentQuestion,
    scrollActiveThinkingToBottom,
  ]);

  const toggleAllowedAgentTool = useCallback((toolId: RuntimeAgentToolName, enabled: boolean) => {
    setAllowedAgentTools((current) => {
      if (enabled) {
        return current.includes(toolId) ? current : normalizeAllowedRuntimeAgentTools([...current, toolId]);
      }

      return current.filter((item) => item !== toolId);
    });
  }, []);

  const changeContextEngine = useCallback((engineId: string) => {
    if (visibleActiveAgentTaskId) {
      setSettingsError("Agent 正在处理，结束后再切换上下文引擎");
      return;
    }

    const nextEngine = getContextEngineDescriptor(engineId);
    setSettingsError("");
    preferredContextEngineIdRef.current = nextEngine.id;
    writePreferredContextEngineId(nextEngine.id);
    setContextEngineId(nextEngine.id);
  }, [visibleActiveAgentTaskId]);

  const {
    allSidebarWorkspaces,
    defaultWorkspace,
    isActiveDefaultWorkspace,
    sidebarWorkspaces,
    sidebarChatSessions,
    setChatSessions,
    isDefaultSessionsLoading,
    workspaceSessionsById,
    isWorkspaceSessionsLoading,
    isSessionsLoading,
    sessionsError,
    setSessionsError,
    startSidebarSession,
    openWorkspaceFromCurrentContext,
    loadDefaultSessionById,
    loadWorkspaceSessionById,
    removeDefaultSession,
    removeWorkspaceSession,
  } = useWorkspaceChatSessions({
    workspace,
    workspaceSections,
    onOpenWorkspace,
    closeSettingsAndContextPanels,
    setIsContextPanelOpen,
    setComposerResetKey,
    currentSessionId,
    setCurrentSessionId,
    currentSessionTitle,
    setCurrentSessionTitle,
    currentSessionIdRef,
    currentSessionTitleRef,
    messages,
    setMessages,
    messagesRef,
    conversation,
    setConversation,
    conversationRef,
    conversationContext,
    setConversationContext,
    conversationContextRef,
    chatTrace,
    replaceChatTrace,
    setContextDebugSnapshot,
    setContextEngineId,
    preferredContextEngineIdRef,
    setAgentRuntimeSessionId,
    setAgentSessionStatus,
    setAgentSessionError,
    runningAgentTasksRef,
    detachActiveAgentTask,
    applyActiveAgentTaskState,
    clearExpandedAgentBlocks,
    clearAgentQuestionDraft,
    isAgentTaskRunningForSession,
    pendingAgentQuestion,
    visibleActiveAgentTaskId,
    agentContextInvalidatedRef,
  });
  const resetConversationSkillGroup = useCallback(() => {
    skillGroupSelectionTouchedRef.current = false;
    setSelectedSkillGroupIds(resolvedDefaultSkillGroupIds);
  }, [resolvedDefaultSkillGroupIds]);
  const toggleConversationSkillGroup = useCallback((skillGroupId: string, checked: boolean) => {
    skillGroupSelectionTouchedRef.current = true;
    setSelectedSkillGroupIds((current) =>
      toggleSkillGroupSelection(current, skillGroupId, checked)
    );
  }, []);
  const startSessionWithDefaultSkillGroup = useCallback(() => {
    resetConversationSkillGroup();
    setChatMode("agent");
    startSidebarSession();
  }, [resetConversationSkillGroup, startSidebarSession]);
  const loadDefaultSessionWithDefaultSkillGroup = useCallback(async (sessionId: string) => {
    resetConversationSkillGroup();
    await loadDefaultSessionById(sessionId);
  }, [loadDefaultSessionById, resetConversationSkillGroup]);
  const loadWorkspaceSessionWithDefaultSkillGroup = useCallback(async (
    targetWorkspace: Workspace,
    sessionId: string,
  ) => {
    resetConversationSkillGroup();
    await loadWorkspaceSessionById(targetWorkspace, sessionId);
  }, [loadWorkspaceSessionById, resetConversationSkillGroup]);

  const refreshAgentSessionStatus = useCallback(async () => {
    const requestId = agentSessionStatusRequestIdRef.current + 1;
    agentSessionStatusRequestIdRef.current = requestId;
    setIsAgentSessionLoading(true);
    setAgentSessionError("");

    try {
      if (!agentRuntimeSessionId) {
        if (agentSessionStatusRequestIdRef.current === requestId) {
          setAgentSessionStatus(null);
        }
        return;
      }

      const status = await getAgentSessionStatus(workspace.path, agentRuntimeSessionId);
      if (agentSessionStatusRequestIdRef.current !== requestId) {
        return;
      }
      setAgentSessionStatus(status);
    } catch (caught) {
      if (agentSessionStatusRequestIdRef.current === requestId) {
        setAgentSessionError(String(caught));
      }
    } finally {
      if (agentSessionStatusRequestIdRef.current === requestId) {
        setIsAgentSessionLoading(false);
      }
    }
  }, [agentRuntimeSessionId, workspace.path]);

  const cleanupAgentSessions = useCallback(async () => {
    setIsAgentSessionLoading(true);
    setAgentSessionError("");

    try {
      const result = await cleanupOrphanAgentSessions(workspace.path, agentRuntimeSessionId);
      await refreshAgentSessionStatus();
      setAgentSessionError(
        result.removedCount > 0
          ? `已清理 ${result.removedCount} 个孤儿上下文`
          : "没有需要清理的孤儿上下文",
      );
    } catch (caught) {
      setAgentSessionError(String(caught));
    } finally {
      setIsAgentSessionLoading(false);
    }
  }, [agentRuntimeSessionId, refreshAgentSessionStatus, workspace.path]);

  useEffect(() => {
    setWorkspaceView("chat");
  }, [workspace.id]);

  useEffect(() => {
    void refreshAgentSessionStatus();
  }, [refreshAgentSessionStatus]);

  useEffect(() => {
    activeAgentTaskIdRef.current = activeAgentTaskId;
  }, [activeAgentTaskId]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    currentSessionTitleRef.current = currentSessionTitle;
  }, [currentSessionTitle]);

  useEffect(() => {
    pendingAgentQuestionRef.current = pendingAgentQuestion;
  }, [pendingAgentQuestion]);

  useEffect(() => {
    agentQuestionAnswerRef.current = agentQuestionAnswer;
  }, [agentQuestionAnswer]);

  useEffect(() => {
    customAgentQuestionAnswerRef.current = customAgentQuestionAnswer;
  }, [customAgentQuestionAnswer]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    conversationContextRef.current = conversationContext;
    contextSessionRef.current.set({
      engineId: contextEngineId,
      context: conversationContext,
    });
  }, [contextEngineId, conversationContext]);

  useEffect(() => {
    if (!visibleActiveAgentTaskId) {
      return;
    }

    const task = runningAgentTasksRef.current.get(visibleActiveAgentTaskId);
    if (!task || messages.some((message) => message.id === task.messageId)) {
      return;
    }

    restoreRunningAgentTaskView(task);
  }, [messages, restoreRunningAgentTaskView, visibleActiveAgentTaskId]);

  useEffect(() => {
    const latestMessage = messages.at(-1);
    const nextScrollSnapshot = {
      lastMessageId: latestMessage?.id ?? null,
      messageCount: messages.length,
      pendingQuestionId: pendingAgentQuestion?.taskId ?? null,
    };
    const previousScrollSnapshot = chatScrollSnapshotRef.current;
    const hasNewMessage =
      nextScrollSnapshot.messageCount !== previousScrollSnapshot.messageCount ||
      nextScrollSnapshot.lastMessageId !== previousScrollSnapshot.lastMessageId;
    const hasNewPendingQuestion =
      nextScrollSnapshot.pendingQuestionId !== previousScrollSnapshot.pendingQuestionId;
    const shouldAnimateScroll = hasNewMessage || hasNewPendingQuestion;

    chatScrollSnapshotRef.current = nextScrollSnapshot;
    scrollActiveThinkingToBottom();
    scrollChatToBottom(shouldAnimateScroll && messages.length > 2 ? "smooth" : "auto");
  }, [messages, pendingAgentQuestion, scrollActiveThinkingToBottom, scrollChatToBottom]);

  const appendAgentConversationResult = useCallback((
    assistantText: string,
    status: "done" | "error",
    statusMessage?: string,
  ) => {
    const agentSessionId = activeAgentSessionIdRef.current || agentRuntimeSessionId || "";
    const agentId = activeAgentIdRef.current || "default";
    const activeTask = activeAgentTaskIdRef.current
      ? runningAgentTasksRef.current.get(activeAgentTaskIdRef.current)
      : undefined;
    const traceTurnId = activeTask?.traceTurnId ?? null;
    const executionSummary = buildAgentExecutionSummary(
      activeAgentTraceRef.current,
      status,
      statusMessage,
    );
    const conversationContent = buildAgentConversationContent(assistantText);

    setConversation((current) => {
      const nextConversation: ConversationMessage[] = [
        ...current,
        {
          id: activeAgentMessageIdRef.current || createMessageId(),
          role: "assistant",
          content: conversationContent,
	          timestamp: Date.now(),
	          metadata: {
	            executionSummary,
	            runStatus: status,
	            runtimeSessionId: agentSessionId,
	          },
        },
      ];
      conversationRef.current = nextConversation;

      void (async () => {
        let latestAgentSessionStatus = agentSessionStatus;
        if (agentSessionId) {
          try {
            latestAgentSessionStatus = await getAgentSessionStatus(workspace.path, agentSessionId);
            setAgentSessionStatus(latestAgentSessionStatus);
            setAgentSessionError("");
          } catch (caught) {
            setAgentSessionError(String(caught));
          }
        }

        const contextBeforeFinalize = contextSessionRef.current.get();
        const finalizeContextStartedAt = Date.now();
        contextSessionRef.current.set({
          engineId: contextEngineId,
          context: contextBeforeFinalize,
        });
        const syncedContext = await contextSessionRef.current.finalizeAgentRun({
          conversation: nextConversation,
          agentSessionId,
          agentId,
          runStatus: status,
          agentSessionStatus: latestAgentSessionStatus,
        });
        agentContextInvalidatedRef.current = false;
        conversationContextRef.current = syncedContext;
        setConversationContext(syncedContext);
        if (traceTurnId && didConversationContextCompress(contextBeforeFinalize, syncedContext)) {
          appendVisibleTraceStep(traceTurnId, contextCompressionTraceStep({
            startedAt: finalizeContextStartedAt,
            previousContext: contextBeforeFinalize,
            nextContext: syncedContext,
            conversationLength: nextConversation.length,
            mode: "agent",
            phase: "agent_finalize",
            engineId: contextEngineId,
            providerName: null,
            modelName: null,
            canUseModel: runtimeAgentRequiresModel,
          }));
        }
      })();

      return nextConversation;
    });

    return executionSummary;
  }, [agentRuntimeSessionId, agentSessionStatus, appendVisibleTraceStep, contextEngineId, workspace.path]);

  const persistRunningAgentTask = useCallback(async (task: RunningAgentTaskContext) => {
    const title = deriveSessionTitle(task.messages);
    const isUnread =
      task.workspacePath !== workspace.path ||
      task.sessionId !== currentSessionIdRef.current;
    task.title = title;
    const session = await saveChatSession({
      workspacePath: task.workspacePath,
      sessionId: task.sessionId,
      title,
      messages: task.messages,
      conversation: task.conversation,
      context: task.context,
      trace: task.chatTrace,
      isUnread,
    });

    if (task.workspacePath === workspace.path) {
      setChatSessions((current) => {
        const nextMeta: ChatSessionMeta = {
          id: session.id,
          title: session.title,
          path: "",
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
          isUnread,
        };
        return upsertChatSessionMeta(current, nextMeta);
      });
    }
  }, [workspace.path]);

  const clearPendingAgentQuestion = useCallback((questionId: string) => {
    const currentQuestion = pendingAgentQuestionRef.current;
    if (currentQuestion?.questionId === questionId) {
      clearAgentQuestionDraft();
    }

    runningAgentTasksRef.current.forEach((task) => {
      if (task.pendingQuestion?.questionId !== questionId) {
        return;
      }
      task.pendingQuestion = null;
      task.questionAnswer = "";
      task.customQuestionAnswer = "";
    });
  }, [clearAgentQuestionDraft]);

  useAgentRuntimeEvents({
    agentRuntime,
    workspacePath: workspace.path,
    currentSessionIdRef,
    activeAgentTaskIdRef,
    activeAgentMessageIdRef,
    activeAgentTraceRef,
    lastAgentErrorRef,
    lastAgentStderrRef,
    handledAgentDoneTaskIdsRef,
    runningAgentTasksRef,
    messagesRef,
    updateMessage,
    appendAgentConversationResult,
    appendRunningAgentTaskTraceStep,
    patchRunningAgentTaskTraceTurn,
    persistRunningAgentTask,
    removeRunningAgentTask,
    applyAgentQuestionDraft,
    clearPendingAgentQuestion,
    restoreRunningAgentTaskView,
    resetActiveAgentTaskState,
    scheduleAgentBlockCollapse,
    setChatError,
    loadFiles,
    refreshAgentSessionStatus,
  });

  useEffect(() => {
    if (visibleActiveAgentTaskId) {
      return;
    }

    setAgentRuntimeSessionId(contextSessionRef.current.getActiveAgentRuntimeSessionId(runtimeAgentId));
  }, [contextEngineId, conversationContext, runtimeAgentId, visibleActiveAgentTaskId]);

  const compressConversationContext = useCallback(async () => {
    if (conversation.length === 0) {
      return;
    }

    const compressionStartedAt = Date.now();
    const previousContext = contextSessionRef.current.get() ?? conversationContext;
    const latestTraceTurn = chatTraceRef.current[chatTraceRef.current.length - 1];
    setIsContextCompressing(true);
    setSessionsError("");

    try {
      contextSessionRef.current.set({
        engineId: contextEngineId,
        context: previousContext,
        modelContext: contextModelFor(effectiveRuntimeModel),
        summarizer: summarizerFor(effectiveRuntimeModel),
        canUseModel: runtimeAgentRequiresModel,
      });
      const nextContext = await contextSessionRef.current.compressConversation({
        conversation,
      });
      conversationContextRef.current = nextContext;
      setConversationContext(nextContext);
      if (latestTraceTurn && didConversationContextCompress(previousContext, nextContext)) {
        appendVisibleTraceStep(latestTraceTurn.id, contextCompressionTraceStep({
          startedAt: compressionStartedAt,
          previousContext,
          nextContext,
          conversationLength: conversation.length,
          mode: "manual",
          phase: "manual",
	          engineId: contextEngineId,
          providerName: effectiveRuntimeModel?.provider.name ?? null,
          modelName: effectiveRuntimeModel?.modelName ?? null,
          canUseModel: runtimeAgentRequiresModel,
        }));
      }
    } catch (caught) {
      const message = String(caught);
      if (latestTraceTurn) {
        appendVisibleTraceStep(latestTraceTurn.id, {
          type: "error",
          label: "上下文压缩失败",
          startedAt: compressionStartedAt,
          endedAt: Date.now(),
          status: "error",
          content: message,
          metadata: {
            mode: "manual",
	            engineId: contextEngineId,
            conversationLength: conversation.length,
          },
        });
      }
      setSessionsError(message);
    } finally {
      setIsContextCompressing(false);
    }
  }, [
    appendVisibleTraceStep,
    conversation,
    conversationContext,
    contextModelFor,
    contextEngineId,
    effectiveRuntimeModel,
    runtimeAgentRequiresModel,
    summarizerFor,
  ]);

  const rebuildContextAfterHistoryChange = useCallback(async (
    nextConversation: ConversationMessage[],
  ) => {
    const collaborationSummaryAgent = chatMode === "collab"
      ? selectedCollaborationWorkflow?.writerAgent ?? null
      : null;
    const summaryRuntimeModel = collaborationSummaryAgent?.runtimeModel ?? effectiveRuntimeModel;
    const summarySummarizer = summarizerFor(summaryRuntimeModel);
    contextSessionRef.current.set({
      engineId: contextEngineId,
      context: conversationContextRef.current,
      modelContext: contextModelFor(summaryRuntimeModel),
      summarizer: summarySummarizer,
      canUseModel: runtimeAgentRequiresModel,
    });
    const nextContext = await contextSessionRef.current.rebuildAfterHistoryChange({
      conversation: nextConversation,
    });
    conversationContextRef.current = nextContext;
    setConversationContext(nextContext);
  }, [
    chatMode,
    contextModelFor,
    contextEngineId,
    effectiveRuntimeModel,
    runtimeAgentRequiresModel,
    selectedCollaborationWorkflow,
    summarizerFor,
  ]);

  const applyHistoryChange = useCallback((
    nextMessages: ChatMessage[],
  ) => {
    if (visibleActiveAgentTaskId) {
      setSessionsError("Agent 正在处理，结束后再修改历史记录");
      return;
    }

    setSessionsError("");
    const sanitizedConversation = stripHiddenAgentContextMetadata(
      rebuildConversationFromVisibleMessages(
        conversationRef.current,
        messagesRef.current,
        nextMessages,
      ),
    );
    agentContextInvalidatedRef.current = true;
    contextSessionRef.current.set({
      engineId: contextEngineId,
      context: conversationContextRef.current,
    });
    const invalidatedContext = contextSessionRef.current.invalidateAfterHistoryChange({
      conversation: sanitizedConversation,
    });
    conversationContextRef.current = invalidatedContext;
    setConversationContext(invalidatedContext);
    setContextDebugSnapshot(null);
    setAgentRuntimeSessionId(null);
    setAgentSessionStatus(null);
    setAgentSessionError("");
    messagesRef.current = nextMessages;
    conversationRef.current = sanitizedConversation;
    setMessages(nextMessages);
    setConversation(sanitizedConversation);
    if (currentSessionId) {
      const resetPromise = resetAgentSessionsForChat(workspace.path, currentSessionId)
        .then(() => true)
        .catch((caught) => {
          setSessionsError(String(caught));
          return false;
        })
        .finally(() => {
          if (agentSessionResetPromiseRef.current === resetPromise) {
            agentSessionResetPromiseRef.current = null;
          }
        });
      agentSessionResetPromiseRef.current = resetPromise;
    }
    void rebuildContextAfterHistoryChange(sanitizedConversation).catch((caught) => {
      setSessionsError(String(caught));
    });
  }, [
    contextEngineId,
    currentSessionId,
    rebuildContextAfterHistoryChange,
    visibleActiveAgentTaskId,
    workspace.path,
  ]);

  const editHistoryMessage = useCallback((messageId: string, nextText: string) => {
    const content = nextText.trim();
    if (!content) {
      setSessionsError("消息内容不能为空，可以使用删除操作移除这条消息");
      return;
    }

    const currentMessages = messagesRef.current;
    const editedMessage = currentMessages.find((message) => message.id === messageId);
    const editedMessages = currentMessages.map((message) =>
      message.id === messageId
        ? {
          ...message,
          text: content,
          thinking: undefined,
          agentBlocks: undefined,
          status: message.status === "error" ? "done" : message.status,
        }
        : message,
    );
    const nextMessages = editedMessage
      ? keepHistoryThroughMessage(editedMessages, messageId)
      : editedMessages;

    applyHistoryChange(nextMessages);
  }, [applyHistoryChange]);

  const deleteHistoryMessage = useCallback((messageId: string) => {
    applyHistoryChange(removeHistoryMessageSegment(messagesRef.current, messageId));
  }, [applyHistoryChange]);

  const moveHistoryMessage = useCallback((
    messageId: string,
    direction: "up" | "down",
  ) => {
    applyHistoryChange(moveHistoryItem(messagesRef.current, messageId, direction));
  }, [applyHistoryChange]);
  const latestAgentExecutionSummary = useMemo(
    () => findLatestAgentExecutionSummary(conversation),
    [conversation],
  );

  const submitAgentQuestionAnswer = async (answerValue: string) => {
    const answer = answerValue.trim();
    if (!pendingAgentQuestion || !answer || isAnsweringAgentQuestion) {
      return;
    }
    if (answeringAgentQuestionIdsRef.current.has(pendingAgentQuestion.questionId)) {
      return;
    }

    answeringAgentQuestionIdsRef.current.add(pendingAgentQuestion.questionId);
    setIsAnsweringAgentQuestion(true);
    setChatError("");

    try {
      const answeredQuestionId = pendingAgentQuestion.questionId;
      await agentRuntime.answerQuestion(
        pendingAgentQuestion.taskId,
        answeredQuestionId,
        answer,
      );
      clearPendingAgentQuestion(answeredQuestionId);
      setAgentQuestionAnswerDraft("");
      setCustomAgentQuestionAnswerDraft("");
    } catch (caught) {
      setChatError(String(caught));
    } finally {
      answeringAgentQuestionIdsRef.current.delete(pendingAgentQuestion.questionId);
      setIsAnsweringAgentQuestion(false);
    }
  };

  const loadReferencedFiles = async (
    referencedFilePreviews: ComposerSubmitInput["referencedFilePreviews"],
  ): Promise<ResolvedFileReference[]> => Promise.all(
    referencedFilePreviews.map(async (file) => {
      const content = await readWorkspaceFile(workspace.path, file.path);
      return {
        path: content.path,
        content: content.content,
      };
    }),
  );

  const commitChatTurnDraft = ({
    nextSessionId,
    nextConversation,
    userUiMessage,
    assistantUiMessage,
    traceTurn,
  }: CommitChatTurnDraftInput) => {
    if (nextSessionId && nextSessionId !== currentSessionId) {
      currentSessionIdRef.current = nextSessionId;
      setCurrentSessionId(nextSessionId);
    }

    const nextMessages = assistantUiMessage
      ? [...messagesRef.current, userUiMessage, assistantUiMessage]
      : [...messagesRef.current, userUiMessage];
    messagesRef.current = nextMessages;
    conversationRef.current = nextConversation;
    replaceChatTrace([...chatTraceRef.current, traceTurn]);
    setMessages(nextMessages);
    setConversation(nextConversation);
    setIsSending(true);
    setChatError("");

    return nextMessages;
  };

  const prepareChatTurnRuntime = async ({
    now,
    userMessageId,
    assistantMessageId,
    traceTurnId,
    text,
    referencedFiles,
    nextConversation,
    baseConversationContext,
    traceProviderName,
    traceModelName,
    summaryRuntimeModel,
  }: PrepareChatTurnRuntimeInput): Promise<PreparedChatTurnRuntime> => {
    const limitsFor: LimitsForProvider = (
      runtimeModel,
    ) => contextSessionRef.current.getContextLimits({
      engineId: contextEngineId,
      modelContext: contextModelFor(runtimeModel),
      canUseModel: false,
    });
    const summaryModelContext = contextModelFor(summaryRuntimeModel);
    const summarySummarizer = summarizerFor(summaryRuntimeModel);
    const prepareContextStartedAt = Date.now();
    contextSessionRef.current.set({
      engineId: contextEngineId,
      context: baseConversationContext,
      modelContext: summaryModelContext,
      summarizer: summarySummarizer,
      canUseModel: runtimeAgentRequiresModel,
    });
    const preparedContext = await contextSessionRef.current.prepareConversation({
      conversation: nextConversation,
    });
    const summaryLimits = preparedContext.limits;
    const nextConversationContext = preparedContext.context;
    const runtimeMessages = preparedContext.runtimeMessages;
    const conversationSummary = preparedContext.conversationSummary;
    setConversationContext(nextConversationContext);
    conversationContextRef.current = nextConversationContext;
    patchVisibleTraceTurn(traceTurnId, {
      contextEngineId,
      contextWindow: summaryModelContext.contextWindow ?? effectiveAppContextWindow,
      conversationSummary,
    });
    appendVisibleTraceStep(traceTurnId, {
      type: "context",
      label: "上下文准备",
      startedAt: prepareContextStartedAt,
      endedAt: Date.now(),
      status: "done",
      content: conversationSummary || "（空）",
      metadata: {
        engineId: contextEngineId,
        runtimeMessageCount: runtimeMessages.length,
        contextWindow: summaryModelContext.contextWindow ?? effectiveAppContextWindow,
        canUseModel: runtimeAgentRequiresModel,
      },
      payloads: [
        {
          label: "runtime messages",
          content: formatDebugMessages(runtimeMessages),
        },
      ],
    });
    if (didConversationContextCompress(baseConversationContext, nextConversationContext)) {
      appendVisibleTraceStep(traceTurnId, contextCompressionTraceStep({
        startedAt: prepareContextStartedAt,
        previousContext: baseConversationContext,
        nextContext: nextConversationContext,
	        conversationLength: nextConversation.length,
	        mode: chatMode,
	        phase: "prepare",
	        engineId: contextEngineId,
        providerName: summaryRuntimeModel?.provider.name ?? null,
        modelName: summaryRuntimeModel?.modelName ?? null,
        canUseModel: runtimeAgentRequiresModel,
      }));
    }

	    const debugSnapshotBase: Omit<ContextDebugSnapshot, "payloads" | "updatedAt"> = {
	      id: `${now}-${userMessageId}`,
	      mode: chatMode,
	      engineId: contextEngineId,
      contextWindow: summaryModelContext.contextWindow ?? effectiveAppContextWindow,
      runtimeAgentId,
      agentSessionId: null,
      providerName: traceProviderName,
      modelName: traceModelName,
      activeFilePath: activeFile?.path ?? null,
      referencedFilePaths: referencedFiles.map((file) => file.path),
      activeSkillNames,
      conversationSummary,
      runtimeMessages,
    };
    const publishContextDebugSnapshot: PublishContextDebugSnapshot = (
      payloads,
      overrides = {},
    ) => {
      setContextDebugSnapshot({
        ...debugSnapshotBase,
        updatedAt: Date.now(),
        payloads,
        ...overrides,
      });
    };

    const hasRagIndex = contextEngineDescriptor.capabilities.includes("rag_index");
    const knowledgeMatches = hasRagIndex
      ? await knowledgeRagIndex.search({
        query: text,
        conversation: nextConversation,
        references: referencedFiles,
        maxResults: 8,
        metadata: {
          workspaceId: workspace.id,
          workspacePath: workspace.path,
        },
      })
      : [];
    appendVisibleTraceStep(traceTurnId, {
      type: "rag",
      label: "知识库检索",
      status: "done",
      content: formatKnowledgeMatches(knowledgeMatches),
      metadata: {
	        enabled: hasRagIndex,
        matchCount: knowledgeMatches.length,
        query: text,
      },
    });
    const knowledgeDebugPayload: ContextDebugPayload = {
      label: "retrieved knowledge",
      sourceLabel: "RAG",
      sourceDescription: "全局知识库已启用集合检索",
      content: formatKnowledgeMatches(knowledgeMatches),
    };
    const finalizeAssistantTurn: FinalizeAssistantTurn = async ({
      mode,
      assistantText,
      assistantMessages,
    }) => {
      const finalConversation: ConversationMessage[] = [
        ...nextConversation,
        ...(assistantMessages && assistantMessages.length > 0
          ? assistantMessages
          : [{
            id: assistantMessageId,
            role: "assistant" as const,
            content: assistantText,
            timestamp: Date.now(),
          }]),
      ];
      conversationRef.current = finalConversation;
      setConversation(finalConversation);

      const finalizeContextStartedAt = Date.now();
      const contextBeforeFinalize = conversationContextRef.current;
      contextSessionRef.current.set({
        engineId: contextEngineId,
        context: contextBeforeFinalize,
        modelContext: contextModelFor(summaryRuntimeModel),
        canUseModel: runtimeAgentRequiresModel,
      });
      const finalContext = await contextSessionRef.current.finalizeChatTurn({
        conversation: finalConversation,
      });
      conversationContextRef.current = finalContext;
      setConversationContext(finalContext);

      if (didConversationContextCompress(contextBeforeFinalize, finalContext)) {
        appendVisibleTraceStep(traceTurnId, contextCompressionTraceStep({
          startedAt: finalizeContextStartedAt,
          previousContext: contextBeforeFinalize,
          nextContext: finalContext,
          conversationLength: finalConversation.length,
          mode,
          phase: "finalize",
	          engineId: contextEngineId,
          providerName: summaryRuntimeModel?.provider.name ?? null,
          modelName: summaryRuntimeModel?.modelName ?? null,
          canUseModel: runtimeAgentRequiresModel,
        }));
      }
      appendVisibleTraceStep(traceTurnId, {
        type: "context",
        label: "上下文回写",
        status: "done",
        content: finalContext?.summary ?? "（空）",
        metadata: {
          mode,
          conversationLength: finalConversation.length,
        },
      });
      patchVisibleTraceTurn(traceTurnId, {
        status: "done",
        conversationSummary: finalContext?.summary ?? conversationSummary,
      });
    };

    return {
      summaryLimits,
      nextConversationContext,
      runtimeMessages,
      conversationSummary,
      knowledgeMatches,
      knowledgeDebugPayload,
      limitsFor,
      publishContextDebugSnapshot,
      finalizeAssistantTurn,
    };
  };

  const sendMessage = async ({
    text,
    referencedFilePreviews,
    unresolvedFileReferences,
    ambiguousFileReferences,
  }: ComposerSubmitInput) => {
    if (!text || isSending || visibleActiveAgentTaskId) {
      return;
    }

    const shouldRunAgentTask = isAgentTaskMode(chatMode, chatExecutionMode);
    const submitValidation = validateComposerSubmit({
      chatMode,
      selectedCollaborationWorkflow,
      runtimeAgentRequiresModel,
      effectiveRuntimeModel,
      unresolvedFileReferences,
      ambiguousFileReferences,
    });
    if (!submitValidation.ok) {
      setChatError(submitValidation.error);
      return;
    }
    const {
      collaborationWorkflow,
      collaborationWriterAgent,
      collaborationReviewerAgent,
    } = submitValidation;

    let referencedFiles: ResolvedFileReference[];
    try {
      referencedFiles = await loadReferencedFiles(referencedFilePreviews);
    } catch (caught) {
      setChatError(`读取引用文件失败：${String(caught)}`);
      return;
    }

    const now = Date.now();
    const userMessageId = createMessageId();
    const assistantMessageId = createMessageId();
    const baseConversation = conversationRef.current;
    const baseConversationContext = conversationContextRef.current;
    const currentAgentExecutionSummary = findLatestAgentExecutionSummary(baseConversation);
    const traceProviderName = chatMode === "collab" && collaborationWriterAgent && collaborationReviewerAgent
      ? `${collaborationWriterAgent.runtimeModel.provider.name} / ${collaborationReviewerAgent.runtimeModel.provider.name}`
      : effectiveRuntimeModel?.provider.name ?? null;
    const traceModelName = chatMode === "collab" && collaborationWriterAgent && collaborationReviewerAgent
      ? `${collaborationWriterAgent.runtimeModel.modelName} / ${collaborationReviewerAgent.runtimeModel.modelName}`
      : effectiveRuntimeModel?.modelName ?? null;
    const {
      nextConversation,
      userUiMessage,
      assistantUiMessage,
      traceTurnId,
      traceTurn,
    } = createChatTurnDraft({
      now,
      text,
      chatMode,
      chatExecutionMode,
      modelSource,
      referencedFiles,
      baseConversation,
      baseConversationContext,
      activeFilePath: activeFile?.path ?? null,
      assistantAgentAvatar: chatMode === "collab"
        ? collaborationWriterAgent?.avatar
        : modelSource === "agent" ? selectedAgent?.avatar : undefined,
      assistantAgentName: chatMode === "collab" && collaborationWorkflow
        ? collaborationWorkflow.name
        : modelSource === "agent" ? selectedAgent?.name : undefined,
      providerName: traceProviderName,
      modelName: traceModelName,
      runtimeAgentId,
	      contextEngineId,
      contextWindow: effectiveAppContextWindow,
      userMessageId,
      assistantMessageId,
    });
    const nextSessionId = shouldRunAgentTask && !currentSessionId
      ? createChatSessionId()
      : currentSessionId;
    const nextMessages = commitChatTurnDraft({
      nextSessionId,
      nextConversation,
      userUiMessage,
      assistantUiMessage: chatMode === "collab" ? null : assistantUiMessage,
      traceTurn,
    });

    try {
      const summaryRuntimeModel = chatMode === "collab" && collaborationWriterAgent
        ? collaborationWriterAgent.runtimeModel
        : effectiveRuntimeModel;
      const {
        summaryLimits,
        nextConversationContext,
        runtimeMessages,
        conversationSummary,
        knowledgeMatches,
        knowledgeDebugPayload,
        limitsFor,
        publishContextDebugSnapshot,
        finalizeAssistantTurn,
      } = await prepareChatTurnRuntime({
        now,
        userMessageId,
        assistantMessageId,
        traceTurnId,
        text,
        referencedFiles,
        nextConversation,
        baseConversationContext,
        traceProviderName,
        traceModelName,
        summaryRuntimeModel,
      });

      if (chatMode === "collab") {
        if (!collaborationWorkflow) {
          setChatError("请选择协作流程");
          return;
        }

        await runCollaborationTurn({
          collaborationWorkflow,
          traceTurnId,
          assistantMessageId,
          text,
          referencedFiles,
          nextConversation,
          runtimeMessages,
          summaryLimits,
          conversationSummary,
          currentAgentExecutionSummary,
          knowledgeMatches,
          knowledgeDebugPayload,
          limitsFor,
          publishContextDebugSnapshot,
          finalizeAssistantTurn,
        }, {
          workspace,
          activeFile,
          activeSkills,
          runtimeAgentId,
          agentRuntime,
          contextSession: contextSessionRef.current,
          allowedAgentTools,
          appendMessage,
          requestCollaborationPlanDecision,
          appendVisibleTraceStep,
          updateMessage,
          setChatError,
          setCollaborationPhase,
        });
        return;
      }

      if (runtimeAgentRequiresModel && !effectiveRuntimeModel) {
        setChatError("请选择要使用的 LLM 和模型");
        return;
      }

      if (shouldRunAgentTask) {
        await runAgentTurn({
          nextSessionId,
          traceTurnId,
          assistantMessageId,
          text,
          referencedFiles,
          baseConversation,
          nextConversation,
          nextConversationContext,
          nextMessages,
          conversationSummary,
          knowledgeMatches,
          knowledgeDebugPayload,
          limitsFor,
          publishContextDebugSnapshot,
        }, {
          workspace,
          activeFile,
          activeSkills,
          runtimeAgentId,
          appendVisibleTraceStep,
          updateMessage,
          agentRuntime,
          contextSession: createAgentContextSession({
            engineId: contextEngineId,
            context: baseConversationContext,
          }),
          setChatError,
          setAgentSessionStatus,
          setAgentSessionError,
          prepareActiveAgentRun,
          patchVisibleTraceTurn,
          addRunningAgentTask,
          activateAgentTaskId,
          agentContextInvalidatedRef,
          agentSessionResetPromiseRef,
          handledAgentDoneTaskIdsRef,
          chatTraceRef,
          agentSessionStatus,
          effectiveRuntimeModel,
          modelSource,
          selectedAgent,
          chatMode,
          chatExecutionMode,
          allowedAgentTools,
          currentSessionTitle,
        });
        return;
      }

      await runChatTurn({
        traceTurnId,
        assistantMessageId,
        text,
        referencedFiles,
        runtimeMessages,
        conversationSummary,
        currentAgentExecutionSummary,
        knowledgeMatches,
        knowledgeDebugPayload,
        limitsFor,
        publishContextDebugSnapshot,
        finalizeAssistantTurn,
      }, {
        workspace,
        activeFile,
        activeSkills,
        runtimeAgentId,
        appendVisibleTraceStep,
        updateMessage,
        modelSource,
        selectedAgent,
        effectiveRuntimeModel,
      });
    } catch (caught) {
      const message = String(caught);
      appendVisibleTraceStep(traceTurnId, {
        type: "error",
        label: "链路异常",
        status: "error",
        content: message,
        metadata: {
          mode: chatMode,
        },
      });
      patchVisibleTraceTurn(traceTurnId, {
        status: "error",
      });
      setChatError(message);
      resetActiveAgentTaskState({
        clearQuestion: false,
        clearSession: shouldRunAgentTask,
        resetTrace: shouldRunAgentTask,
      });
      updateMessage(assistantMessageId, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
      if (shouldRunAgentTask) {
        appendAgentConversationResult(message, "error", message);
      }
    } finally {
      collaborationPlanDecisionResolverRef.current = null;
      setCollaborationPlanDecision(null);
      setIsSending(false);
      setCollaborationPhase("idle");
    }
  };

  const activeFileVersionStatus =
    versionStatus?.files.find((file) => {
      const currentPath = activeFile?.path || filePath.trim();
      return (
        currentPath &&
        (file.path === currentPath || file.previousPath === currentPath)
      );
    }) ?? null;

  useChatPanelStoreBridge({
    chatScrollAreaRef,
    workspace,
    workspaces: allSidebarWorkspaces,
    messages,
    expandedThinkingIds,
    expandedAgentEventIds,
    modelSource,
    selectedAgent,
    chatError,
    settingsError,
    skillsError,
    sessionsError,
    pendingAgentQuestion,
    collaborationPlanDecision,
    agentQuestionAnswer,
    customAgentQuestionAnswer,
    isAnsweringAgentQuestion,
    files,
    composerResetKey,
    isSending,
    activeAgentTaskId: visibleActiveAgentTaskId,
    isSettingsLoading,
    chatMode,
    chatExecutionMode,
    showThinkingProcess,
    showToolCallProcess,
    effectiveContextWindow: effectiveAppContextWindow,
    availableRuntimeAgents,
    selectedRuntimeAgent,
    runtimeAgentId,
    agentProfiles,
    runtimeModels,
    selectedRuntimeModelId,
    selectedRuntimeModel,
    collaborationWorkflows,
    selectedCollaborationWorkflow,
    selectedCollaborationWorkflowId,
    allowedAgentTools,
    skillGroups,
    defaultSkillGroupId,
    selectedSkillGroupIds,
    selectedSkillGroupLabel,
    toggleThinking,
    toggleAgentEvents,
    toggleAgentThinkingBlock,
    toggleAgentBlock,
    onEditHistoryMessage: editHistoryMessage,
    onDeleteHistoryMessage: deleteHistoryMessage,
    onMoveHistoryMessage: moveHistoryMessage,
    onOpenWorkspace: openWorkspaceFromCurrentContext,
    onCreateWorkspace,
    resolveCollaborationPlanDecision,
    setAgentQuestionAnswer: setAgentQuestionAnswerDraft,
    setCustomAgentQuestionAnswer: setCustomAgentQuestionAnswerDraft,
    submitAgentQuestionAnswer,
    setChatMode,
    setChatExecutionMode,
    setShowThinkingProcess,
    setShowToolCallProcess,
    setModelSource,
    setSelectedRuntimeAgentId,
    setSelectedAgentId,
    setSelectedCollaborationWorkflowId,
    setSelectedRuntimeModelId,
    toggleAllowedAgentTool,
    toggleSelectedSkillGroup: toggleConversationSkillGroup,
    sendMessage,
    onAbortTask: () => void agentRuntime.abortTask(visibleActiveAgentTaskId),
  });

  const filePanel = (
    <FilePanel
      activeFile={activeFile}
      filePath={filePath}
      fileContent={fileContent}
      fileError={fileError}
      fileViewMode={fileViewMode}
      isMarkdownFile={isMarkdownFile}
      isFileSaving={isFileSaving}
      isFileDeleting={isFileDeleting}
      isFileDiscarding={
        activeFileVersionStatus
          ? discardingVersionFilePath === activeFileVersionStatus.path
          : false
      }
      fileVersionStatus={activeFileVersionStatus}
      previewMode={filePreviewMode === "expanded" ? "expanded" : "side"}
      onFilePathChange={setFilePath}
      onFileContentChange={setFileContent}
      onFileViewModeChange={setFileViewMode}
      onExpandPreview={() => setFilePreviewMode("expanded")}
      onCollapsePreview={() => setFilePreviewMode("side")}
      onClosePreview={() => setFilePreviewMode("closed")}
      onSaveFile={() => void saveFile()}
      onDeleteFile={() => void deleteFile()}
      onDiscardFileChanges={() => {
        if (activeFileVersionStatus) {
          void discardVersionFileChanges(activeFileVersionStatus.path);
        }
      }}
    />
  );

  const chatPanel = <ChatPanel />;

  const skillsPanel = (
    <SkillsPage
      isLoading={isSkillsLoading}
      isSaving={isSkillsSaving}
      isMarketplaceSearching={isSkillMarketplaceSearching}
      isMarketplaceLoadingMore={isSkillMarketplaceLoadingMore}
      isInstalling={isSkillInstalling}
      isRemoving={isSkillRemoving}
      error={skillsError}
      defaultSkillGroupId={defaultSkillGroupId}
      onGroupsChange={updateSkillGroups}
      onDefaultGroupChange={updateDefaultSkillGroup}
      onSearchMarketplace={searchMarketplace}
      onInstallSkill={installMarketplaceSkill}
      onRemoveSkill={removeMarketplaceSkill}
    />
  );

  const settingsPanel = isLlmSettingsOpen ? (
    <LlmSettingsPage
      onBack={() => {
        setIsLlmSettingsOpen(false);
        void loadLlmOptions();
      }}
      onSettingsSaved={() => void loadLlmOptions()}
    />
  ) : (
    <SettingsPanel
      settingsError={settingsError}
      skillsError={skillsError}
      onBack={() => setWorkspaceView("chat")}
      onOpenLlmSettings={() => setIsLlmSettingsOpen(true)}
      onOpenAgentSettings={() => setIsAgentSettingsOpen(true)}
      onOpenCollaborationWorkflowSettings={() => setIsCollaborationWorkflowSettingsOpen(true)}
    />
  );

  const knowledgePanel = (
    <KnowledgeBasePage
      contextEngineId={contextEngineId}
      contextEngines={availableContextEngines}
      onBack={() => setWorkspaceView("chat")}
      onContextEngineChange={changeContextEngine}
    />
  );

  const tavernPanel = (
    <TavernPage
      workspace={workspace}
      files={files}
      runtimeModel={tavernDefaultRuntimeModel}
      runtimeAgentId={runtimeAgentId}
      onRoomImmersiveChange={setIsTavernRoomImmersive}
    />
  );

  useContextPanelStoreBridge({
    isFilesLoading,
    fileTree,
    expandedFileTreePaths,
    activeFile,
    versionStatus,
    versions,
    versionDiff,
    versionFiles,
    historyVersionDiff,
    selectedVersionFilePath,
    selectedHistoryVersionId,
    selectedVersionHistoryBranchName,
    selectedVersionSnapshotFilePath,
    versionMessage,
    versionError,
    isVersionControlLoading,
    isVersionControlInitializing,
    isVersionDiffLoading,
    isVersionFilesLoading,
    isVersionFileContentLoading,
    isCreatingVersion,
    isVersionHistoryLoading,
    restoringVersionFilePath,
    discardingVersionFilePath,
    chatTrace,
    onRefreshFiles: () => void loadFiles(),
    onRefreshVersionControl: () => void loadVersionControl(),
    onSelectVersionFile: (path) => void selectVersionFile(path),
    onSelectHistoryVersion: (version) => void selectHistoryVersion(version),
    onSelectVersionHistoryBranch: (branchName) => void selectVersionHistoryBranch(branchName),
    onSelectHistoryVersionFile: (versionId, path) => void selectHistoryVersionFile(versionId, path),
    onVersionMessageChange: setVersionMessage,
    onCreateVersion: (relativePaths) => void createVersion(relativePaths),
    onDiscardVersionFileChanges: (path, options) => void discardVersionFileChanges(path, options),
    onRestoreHistoryVersionFile: (file) => void restoreHistoryVersionFile(file),
    onPrepareNewFile: prepareNewFile,
    onOpenFile: (path) => void openFile(path),
    onToggleDirectory: toggleFileTreeDirectory,
    onClearChatTrace: clearChatTrace,
  });

  useEffect(() => {
    if (workspaceView !== "tavern" && isTavernRoomImmersive) {
      setIsTavernRoomImmersive(false);
    }
  }, [isTavernRoomImmersive, workspaceView]);

  const isTavernImmersive = workspaceView === "tavern" && isTavernRoomImmersive;

  const dialogs = (
    <>
      <AgentSettingsDialog
        open={isAgentSettingsOpen}
        onOpenChange={(open) => {
          setIsAgentSettingsOpen(open);
          if (!open) {
            void loadLlmOptions();
          }
        }}
      />
      <CollaborationWorkflowSettingsDialog
        open={isCollaborationWorkflowSettingsOpen}
        onOpenChange={(open) => {
          setIsCollaborationWorkflowSettingsOpen(open);
          if (!open) {
            void loadLlmOptions();
          }
        }}
      />
      <ContextWorkbenchDialog
        open={isContextWorkbenchOpen}
        currentSessionId={currentSessionId}
        currentSessionTitle={currentSessionTitle}
        agentRuntimeSessionId={agentRuntimeSessionId}
        activeAgentTaskId={visibleActiveAgentTaskId}
        agentSessionStatus={agentSessionStatus}
        agentSessionError={agentSessionError}
        isAgentSessionLoading={isAgentSessionLoading}
        isContextCompressing={isContextCompressing}
        conversationContext={conversationContext}
        contextDebugSnapshot={contextDebugSnapshot}
        latestAgentExecutionSummary={latestAgentExecutionSummary}
        onOpenChange={handleContextWorkbenchOpenChange}
        onRefreshAgentSession={() => void refreshAgentSessionStatus()}
        onCleanupAgentSessions={() => void cleanupAgentSessions()}
        onCompressConversationContext={() => void compressConversationContext()}
      />
    </>
  );

  const sidebarProps: SidebarProps | null = isTavernImmersive
    ? null
    : {
        workspace,
        workspaces: sidebarWorkspaces,
        activeSessionId: currentSessionId,
        defaultCurrentSessionId: isActiveDefaultWorkspace ? currentSessionId : null,
        defaultCurrentSessionTitle: isActiveDefaultWorkspace ? currentSessionTitle : DEFAULT_SESSION_TITLE,
        hasUnsavedDefaultSession: isActiveDefaultWorkspace && messages.length > 0 && !currentSessionId,
        workspaceCurrentSessionTitle: !isActiveDefaultWorkspace ? currentSessionTitle : DEFAULT_SESSION_TITLE,
        hasUnsavedWorkspaceSession: !isActiveDefaultWorkspace && messages.length > 0 && !currentSessionId,
        isProjectsLoading: isWorkspaceOverviewLoading,
        projectsError: workspaceOverviewError,
        isDefaultSessionsLoading: isActiveDefaultWorkspace ? isSessionsLoading : isDefaultSessionsLoading,
        isWorkspaceSessionsLoading: (!isActiveDefaultWorkspace && isSessionsLoading) || isWorkspaceSessionsLoading,
        defaultChatSessions: sidebarChatSessions,
        defaultWorkspacePath: defaultWorkspace?.path ?? workspace.path,
        workspaceSessionsById,
        isAgentSessionRunning: isAgentTaskRunningForSession,
        suppressDefaultLoadingState: !isActiveDefaultWorkspace && (
          isSending ||
          messages.length > 0 ||
          Boolean(currentSessionId) ||
          Boolean(visibleActiveAgentTaskId)
        ),
        isSkillsOpen: workspaceView === "skills",
        isKnowledgeOpen: workspaceView === "knowledge",
        isTavernOpen: workspaceView === "tavern",
        onOpenWorkspace: openWorkspaceFromCurrentContext,
        onEditWorkspace,
        onStartNewSession: startSessionWithDefaultSkillGroup,
        onOpenContext: openContextWorkbench,
        onOpenSkills: openSkillsPage,
        onOpenKnowledge: () => {
          setIsContextWorkbenchOpen(false);
          setIsLlmSettingsOpen(false);
          setIsAgentSettingsOpen(false);
          setIsCollaborationWorkflowSettingsOpen(false);
          setWorkspaceView("knowledge");
        },
        onOpenTavern: () => {
          setIsContextWorkbenchOpen(false);
          setIsLlmSettingsOpen(false);
          setIsAgentSettingsOpen(false);
          setIsCollaborationWorkflowSettingsOpen(false);
          setWorkspaceView("tavern");
        },
        onLoadDefaultSession: (sessionId) => void loadDefaultSessionWithDefaultSkillGroup(sessionId),
        onRemoveDefaultSession: (sessionId) => void removeDefaultSession(sessionId),
        onLoadWorkspaceSession: (targetWorkspace, sessionId) =>
          void loadWorkspaceSessionWithDefaultSkillGroup(targetWorkspace, sessionId),
        onRemoveWorkspaceSession: (targetWorkspace, sessionId) =>
          void removeWorkspaceSession(targetWorkspace, sessionId),
        onOpenSettings: openSettingsPanel,
      };

  const headerProps: WorkbenchHeaderProps | null = isTavernImmersive
    ? null
    : {
        isContextPanelOpen,
        showToggle: workspaceView === "chat",
        versionStatus,
        isVersionControlLoading,
        isVersionControlInitializing,
        isCreatingVersionBranch,
        switchingVersionBranchName,
        onToggleContextPanel: () => setIsContextPanelOpen((current) => !current),
        onRefreshVersionControl: () => void loadVersionControl(),
        onInitializeVersionControl: () => void initializeVersionControl(),
        onCreateVersionBranch: (branchName) => void createVersionBranch(branchName),
        onSwitchVersionBranch: (branchName) => void switchVersionBranch(branchName),
      };

  const content = workspaceView === "settings" ? (
    settingsPanel
  ) : workspaceView === "skills" ? (
    skillsPanel
  ) : workspaceView === "knowledge" ? (
    knowledgePanel
  ) : workspaceView === "tavern" ? (
    tavernPanel
  ) : filePreviewMode === "expanded" ? (
    filePanel
  ) : filePreviewMode === "side" ? (
    <div className="grid h-full min-h-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.76fr)] xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.86fr)]">
      <div className="min-h-0 overflow-hidden bg-background/95 shadow-[10px_0_28px_-30px_rgb(15_23_42_/_0.32)]">
        {chatPanel}
      </div>
      <div className="min-h-0 overflow-hidden">
        {filePanel}
      </div>
    </div>
  ) : (
    chatPanel
  );

  const contextPanel = isContextPanelOpen && workspaceView === "chat"
    ? <ContextPanel />
    : null;

  return renderShell({
    dialogs,
    sidebarProps,
    headerProps,
    content,
    contextPanel,
    isTavernImmersive,
  });
};
