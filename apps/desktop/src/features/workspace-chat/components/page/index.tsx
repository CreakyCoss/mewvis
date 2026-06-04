import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ALLOWED_AGENT_TOOLS,
  normalizeAllowedAgentTools,
  type AgentRuntimeAgentEvent,
  type AgentToolName,
} from "@/ai/agent-runtime/contracts";
import {
  toAgentRuntimeProviderConfig,
} from "@/ai/agent-runtime/config";
import {
  buildCollaborationSystemPrompt,
  buildAgentConversationContent,
  buildAgentExecutionSummary,
  buildSystemPrompt,
  createAgentMemoryTrace,
  getContextEngine,
  listContextEngines,
  recordAgentMemoryEvent,
  type AgentMemoryTrace,
  type ConversationSummarizer,
  normalizeChatContextSummary,
  normalizeConversationMessages,
} from "@/ai/agent-context";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import { CollaborationWorkflowSettingsDialog } from "@/features/agent-settings/components/collaboration-workflow-dialog";
import { AgentSettingsDialog } from "@/features/agent-settings/components/dialog";
import type { CollaborationWorkflowStepProfile } from "@/features/agent-settings/types";
import { SettingsDialog } from "@/features/llm-settings/components/dialog";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { KnowledgeBasePage } from "@/features/knowledge-base/components/knowledge-base-page";
import { createGlobalKnowledgeRagIndex } from "@/features/knowledge-base/rag-index";
import { SkillsDialog } from "@/features/workspace-skills/components/skills-dialog";
import type { Workspace, WorkspaceSection } from "@/features/workspaces/types";
import {
  cleanupOrphanAgentSessions,
  deleteChatSession,
  getAgentSessionStatus,
  listChatSessions,
  loadChatSession,
  readWorkspaceFile,
  resetAgentSessionsForChat,
  runAgentRuntimeChat,
  saveChatSession,
} from "../../api";
import type {
  ChatMode,
  CollaborationPhase,
  ContextDebugPayload,
  ContextDebugSnapshot,
  ComposerSubmitInput,
  ContextWindowPreset,
  PendingAgentQuestion,
  ResolvedFileReference,
  WorkspaceView,
} from "../../page-types";
import type {
  AgentSessionStatus,
  ChatContextSummary,
  ChatMessage,
  ChatSessionMeta,
  ChatTraceTurn,
  ConversationMessage,
} from "../../types";
import {
  appendAgentToolEventBlock,
  finalizeLastAgentThinkingBlock,
  isTimelineEvent,
  mergeAgentThinking,
  removeEmptyAgentThinkingBlocks,
  updateLastAgentTextBlock,
  updateLastAgentThinkingBlock,
} from "../../utils/agent-blocks";
import {
  readPreferredContextEngineId,
  writePreferredContextEngineId,
} from "./context-engine-preference";
import {
  pendingQuestionFromEvent,
  type RunningAgentTaskContext,
} from "./agent-task";
import {
  findLatestAgentExecutionSummary,
  keepHistoryThroughMessage,
  moveHistoryItem,
  rebuildConversationFromVisibleMessages,
  removeHistoryMessageSegment,
  sortChatSessionsByFixedOrder,
  stripHiddenAgentContextMetadata,
  upsertChatSessionMeta,
} from "./history";
import {
  agentEventTraceStep,
  contextCompressionTraceStep,
  createChatTraceStep,
  didConversationContextCompress,
  formatAgentInitialPromptPreview,
  formatDebugMessages,
  formatKnowledgeMatches,
} from "./trace";
import {
  createChatSessionId,
  createMessageId,
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
} from "../../utils/sessions";
import { ContextWorkbenchDialog } from "../context-workbench/dialog";
import { ChatPanel } from "../chat";
import { useChatPanelStoreBridge } from "../chat/store";
import { ContextPanel } from "../context-panel";
import { useContextPanelStoreBridge } from "../context-panel/store";
import { FilePanel } from "../file-workbench";
import { SettingsPanel } from "../settings";
import { Sidebar } from "../layout/sidebar";
import { WorkbenchHeader } from "../layout/workbench-header";
import { useAgentBlockState } from "./use-agent-block-state";
import { useContextModeling } from "./use-context-modeling";
import { useFileWorkbench } from "./use-file-workbench";
import { useModelSettings } from "./use-model-settings";
import { useRunningAgentTasks } from "./use-running-agent-tasks";
import { useSidebarSessions } from "./use-sidebar-sessions";
import { useChatTraceState } from "./use-chat-trace-state";
import { useWorkspaceSkills } from "./use-workspace-skills";
import { useWorkspaceVersionControl } from "./use-workspace-version-control";

type WorkspaceChatPageProps = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  isWorkspaceOverviewLoading: boolean;
  workspaceOverviewError: string;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
};

type CollaborationPromptPhase = "draft" | "review" | "revise" | "custom";

const promptPhaseForWorkflowStep = (
  step: CollaborationWorkflowStepProfile,
): CollaborationPromptPhase => (
  step.phase === "draft" || step.phase === "review" || step.phase === "revise"
    ? step.phase
    : "custom"
);

const visiblePhaseForWorkflowStep = (
  step: CollaborationWorkflowStepProfile,
  index: number,
  total: number,
): CollaborationPhase => {
  if (step.phase === "draft") {
    return "drafting";
  }
  if (step.phase === "review") {
    return "reviewing";
  }
  if (step.phase === "revise") {
    return "revising";
  }

  if (index === 0) {
    return "drafting";
  }
  if (index === total - 1) {
    return "revising";
  }
  return "reviewing";
};

export const WorkspaceChatPage = ({
  workspace,
  workspaceSections,
  isWorkspaceOverviewLoading,
  workspaceOverviewError,
  onOpenWorkspace,
  onCreateWorkspace,
  onEditWorkspace,
}: WorkspaceChatPageProps) => {
  const agentRuntime = useMemo(() => createAgentRuntime(), []);
  const availableContextEngines = useMemo(() => listContextEngines(), []);
  const [contextEngineId, setContextEngineId] = useState(readPreferredContextEngineId);
  const contextEngine = useMemo(() => getContextEngine(contextEngineId), [contextEngineId]);
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
  const currentSessionIdRef = useRef<string | null>(null);
  const currentSessionTitleRef = useRef(DEFAULT_SESSION_TITLE);
  const pendingAgentQuestionRef = useRef<PendingAgentQuestion | null>(null);
  const agentQuestionAnswerRef = useRef("");
  const customAgentQuestionAnswerRef = useRef("");
  const answeringAgentQuestionIdsRef = useRef<Set<string>>(new Set());
  const conversationSummarizerRef = useRef<ConversationSummarizer | null>(null);
  const agentSessionResetPromiseRef = useRef<Promise<boolean> | null>(null);
  const isHydratingSessionRef = useRef(false);
  const pendingNewSessionWorkspaceIdRef = useRef<string | null>(null);
  const saveSessionTimerRef = useRef<number | null>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const workspaceSidebarSessionsSignatureRef = useRef("");
  const workspaceSidebarSessionsRequestIdRef = useRef(0);
  const defaultSidebarSessionsWorkspaceIdRef = useRef("");
  const defaultSidebarSessionsRequestIdRef = useRef(0);
  const sessionsRequestIdRef = useRef(0);
  const agentSessionStatusRequestIdRef = useRef(0);
  const loadVersionControlRef = useRef<((historyBranchOverride?: string) => Promise<void>) | null>(null);
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [chatError, setChatError] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
  const [contextWindowPreset, setContextWindowPreset] = useState<ContextWindowPreset>("auto");
  const [allowedAgentTools, setAllowedAgentTools] = useState<AgentToolName[]>(() => [
    ...DEFAULT_ALLOWED_AGENT_TOOLS,
  ]);
  const [collaborationPhase, setCollaborationPhase] = useState<CollaborationPhase>("idle");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [isContextWorkbenchOpen, setIsContextWorkbenchOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [isLlmSettingsOpen, setIsLlmSettingsOpen] = useState(false);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const [isCollaborationWorkflowSettingsOpen, setIsCollaborationWorkflowSettingsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeAgentTaskId, setActiveAgentTaskId] = useState("");
  const [pendingAgentQuestion, setPendingAgentQuestion] = useState<PendingAgentQuestion | null>(null);
  const [agentQuestionAnswer, setAgentQuestionAnswer] = useState("");
  const [customAgentQuestionAnswer, setCustomAgentQuestionAnswer] = useState("");
  const [isAnsweringAgentQuestion, setIsAnsweringAgentQuestion] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationContext, setConversationContext] = useState<ChatContextSummary | null>(null);
  const [contextDebugSnapshot, setContextDebugSnapshot] = useState<ContextDebugSnapshot | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSessionMeta[]>([]);
  const [defaultChatSessions, setDefaultChatSessions] = useState<ChatSessionMeta[]>([]);
  const [isDefaultSessionsLoading, setIsDefaultSessionsLoading] = useState(false);
  const [pendingDefaultSessionId, setPendingDefaultSessionId] = useState<string | null>(null);
  const [pendingWorkspaceSession, setPendingWorkspaceSession] = useState<{
    workspaceId: string;
    sessionId: string;
  } | null>(null);
  const [workspaceSessionsById, setWorkspaceSessionsById] = useState<Record<string, ChatSessionMeta[]>>({});
  const [isWorkspaceSessionsLoading, setIsWorkspaceSessionsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState(DEFAULT_SESSION_TITLE);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [, setIsSessionSaving] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [agentRuntimeSessionId, setAgentRuntimeSessionId] = useState<string | null>(null);
  const [agentSessionStatus, setAgentSessionStatus] = useState<AgentSessionStatus | null>(null);
  const [agentSessionError, setAgentSessionError] = useState("");
  const [isAgentSessionLoading, setIsAgentSessionLoading] = useState(false);
  const [isContextCompressing, setIsContextCompressing] = useState(false);
  const {
    providers,
    selectedProviderId,
    setSelectedProviderId,
    setSelectedModelId,
    modelSource,
    setModelSource,
    setSelectedAgentId,
    settingsError,
    setSettingsError,
    isSettingsLoading,
    selectedModel,
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
    effectiveProvider,
    effectiveModel,
    loadLlmOptions,
  } = useModelSettings({
    agentRuntime,
    chatMode,
  });
  const {
    runtimeModelFor,
    contextModelFor,
    effectiveAppContextWindow,
    summarizerFor,
  } = useContextModeling({
    contextWindowPreset,
    runtimeAgentRequiresModel,
    effectiveProvider,
    effectiveModel,
  });
  const {
    skills,
    enabledSkillNames,
    enabledSkills,
    isSkillsDialogOpen,
    setIsSkillsDialogOpen,
    skillsError,
    isSkillsLoading,
    isSkillsSaving,
    toggleWorkspaceSkill,
    handleSkillsDialogOpenChange,
    saveSkills,
  } = useWorkspaceSkills({
    workspaceId: workspace.id,
  });
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
    selectableFiles,
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
    setWorkspaceView("settings");
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
    activeAgentTaskIdRef.current = task.taskId;
    activeAgentMessageIdRef.current = task.messageId;
    activeAgentSessionIdRef.current = task.agentSessionId;
    activeAgentIdRef.current = task.agentId;
    activeAgentTraceRef.current = task.trace;
    lastAgentErrorRef.current = task.lastError;
    lastAgentStderrRef.current = task.lastStderr;
    pendingAgentQuestionRef.current = task.pendingQuestion;
    agentQuestionAnswerRef.current = task.questionAnswer;
    customAgentQuestionAnswerRef.current = task.customQuestionAnswer;
    setMessages(task.messages);
    setConversation(task.conversation);
    setConversationContext(task.context);
    setContextEngineId(getContextEngine(
      task.context?.engine?.id ?? preferredContextEngineIdRef.current,
    ).id);
    setPendingAgentQuestion(task.pendingQuestion);
    setAgentQuestionAnswer(task.questionAnswer);
    setCustomAgentQuestionAnswer(task.customQuestionAnswer);
    const nextTitle = task.title || deriveSessionTitle(task.messages);
    currentSessionTitleRef.current = nextTitle;
    setCurrentSessionTitle(nextTitle);
    setAgentRuntimeSessionId(task.agentSessionId);
    setActiveAgentTaskId(task.taskId);
    return true;
  }, []);

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
      currentTask.context = conversationContextRef.current;
      currentTask.pendingQuestion =
        pendingAgentQuestionRef.current?.taskId === currentTaskId
          ? pendingAgentQuestionRef.current
          : null;
      currentTask.questionAnswer = agentQuestionAnswerRef.current;
      currentTask.customQuestionAnswer = customAgentQuestionAnswerRef.current;
    }

    activeAgentTaskIdRef.current = "";
    activeAgentMessageIdRef.current = "";
    activeAgentSessionIdRef.current = "";
    activeAgentIdRef.current = "";
    activeAgentTraceRef.current = createAgentMemoryTrace();
    lastAgentErrorRef.current = "";
    lastAgentStderrRef.current = "";
    pendingAgentQuestionRef.current = null;
    agentQuestionAnswerRef.current = "";
    customAgentQuestionAnswerRef.current = "";
    setActiveAgentTaskId("");
    setPendingAgentQuestion(null);
    setAgentQuestionAnswer("");
    setCustomAgentQuestionAnswer("");
  }, [workspace.path]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const viewport = chatScrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']",
      );
      viewport?.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      });
    });
  }, []);

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

  const toggleAllowedAgentTool = useCallback((toolId: AgentToolName, enabled: boolean) => {
    setAllowedAgentTools((current) => {
      if (enabled) {
        return current.includes(toolId) ? current : normalizeAllowedAgentTools([...current, toolId]);
      }

      return current.filter((item) => item !== toolId);
    });
  }, []);

  const changeContextEngine = useCallback((engineId: string) => {
    if (visibleActiveAgentTaskId) {
      setSettingsError("Agent 正在处理，结束后再切换上下文引擎");
      return;
    }

    const nextEngine = getContextEngine(engineId);
    setSettingsError("");
    preferredContextEngineIdRef.current = nextEngine.id;
    writePreferredContextEngineId(nextEngine.id);
    setContextEngineId(nextEngine.id);
  }, [visibleActiveAgentTaskId]);

  const hydrateSession = useCallback((
    session: {
      id: string | null;
      title: string;
      messages: ChatMessage[];
      conversation: ConversationMessage[];
      context?: ChatContextSummary | null;
      trace?: ChatTraceTurn[];
    } | null,
  ) => {
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
      saveSessionTimerRef.current = null;
    }
    detachActiveAgentTask();
    isHydratingSessionRef.current = true;
    const normalizedConversation = normalizeConversationMessages(session?.conversation ?? []);
    const runningTask = session?.id
      ? [...runningAgentTasksRef.current.values()].find((task) =>
        task.workspacePath === workspace.path && task.sessionId === session.id
      )
      : null;
    const hydratedMessages = runningTask?.messages ?? session?.messages ?? [];
    const hydratedConversation = runningTask?.conversation ?? normalizedConversation;
    const hydratedContext = runningTask?.context ?? normalizeChatContextSummary(session?.context ?? null);
    const hydratedTrace = runningTask?.chatTrace ?? session?.trace ?? [];
    const visibleConversation = hydratedMessages.length > 0
      ? rebuildConversationFromVisibleMessages(
        hydratedConversation,
        hydratedMessages,
        hydratedMessages,
      )
      : hydratedConversation;
    messagesRef.current = hydratedMessages;
    conversationRef.current = visibleConversation;
    conversationContextRef.current = hydratedContext;
    agentContextInvalidatedRef.current = false;
    setMessages(hydratedMessages);
    setConversation(visibleConversation);
    setConversationContext(hydratedContext);
    replaceChatTrace(hydratedTrace);
    setContextDebugSnapshot(null);
    setContextEngineId(getContextEngine(
      runningTask?.context?.engine?.id ?? preferredContextEngineIdRef.current,
    ).id);
    const nextSessionId = session?.id ?? null;
    const nextSessionTitle = session?.title || DEFAULT_SESSION_TITLE;
    currentSessionIdRef.current = nextSessionId;
    currentSessionTitleRef.current = nextSessionTitle;
    setCurrentSessionId(nextSessionId);
    setCurrentSessionTitle(nextSessionTitle);
    setAgentRuntimeSessionId(runningTask?.agentSessionId ?? null);
    setAgentSessionStatus(null);
    setAgentSessionError("");
    clearExpandedAgentBlocks();
    if (runningTask) {
      activeAgentTaskIdRef.current = runningTask.taskId;
      activeAgentMessageIdRef.current = runningTask.messageId;
      activeAgentSessionIdRef.current = runningTask.agentSessionId;
      activeAgentIdRef.current = runningTask.agentId;
      activeAgentTraceRef.current = runningTask.trace;
      pendingAgentQuestionRef.current = runningTask.pendingQuestion;
      agentQuestionAnswerRef.current = runningTask.questionAnswer;
      customAgentQuestionAnswerRef.current = runningTask.customQuestionAnswer;
      setActiveAgentTaskId(runningTask.taskId);
      setPendingAgentQuestion(runningTask.pendingQuestion);
      setAgentQuestionAnswer(runningTask.questionAnswer);
      setCustomAgentQuestionAnswer(runningTask.customQuestionAnswer);
    }
    window.setTimeout(() => {
      isHydratingSessionRef.current = false;
    }, 0);
  }, [clearExpandedAgentBlocks, detachActiveAgentTask, replaceChatTrace, workspace.path]);

  const {
    allSidebarWorkspaces,
    defaultWorkspace,
    isActiveDefaultWorkspace,
    sidebarWorkspaces,
    sidebarWorkspacesSignature,
    sidebarChatSessions,
    visibleSidebarSessions,
  } = useSidebarSessions({
    workspace,
    workspaceSections,
    chatSessions,
    defaultChatSessions,
    showAllSessions,
  });

  const loadSessions = useCallback(async () => {
    const requestId = sessionsRequestIdRef.current + 1;
    sessionsRequestIdRef.current = requestId;
    setIsSessionsLoading(true);
    setSessionsError("");
    const workspaceSessionIdToLoad =
      pendingWorkspaceSession?.workspaceId === workspace.id
        ? pendingWorkspaceSession.sessionId
        : null;
    const sessionIdToLoad = isActiveDefaultWorkspace
      ? pendingDefaultSessionId
      : workspaceSessionIdToLoad;
    const shouldStartPendingNewSession = pendingNewSessionWorkspaceIdRef.current === workspace.id;
    const shouldStartEmptySession = shouldStartPendingNewSession;

    try {
      const [sessions, targetSession] = await Promise.all([
        listChatSessions(workspace.path),
        shouldStartEmptySession
          ? Promise.resolve(null)
          : loadChatSession(workspace.path, sessionIdToLoad),
      ]);
      if (sessionsRequestIdRef.current !== requestId) {
        return;
      }
      setChatSessions(sortChatSessionsByFixedOrder(sessions));
      if (shouldStartEmptySession) {
        closeSettingsAndContextPanels();
        setSessionsError("");
        setIsContextPanelOpen(false);
        setComposerResetKey((current) => current + 1);
        pendingAgentQuestionRef.current = null;
        agentQuestionAnswerRef.current = "";
        customAgentQuestionAnswerRef.current = "";
        setPendingAgentQuestion(null);
        if (shouldStartPendingNewSession) {
          pendingNewSessionWorkspaceIdRef.current = null;
        }
        hydrateSession(null);
        return;
      }

      if (sessionIdToLoad) {
        if (isActiveDefaultWorkspace) {
          setPendingDefaultSessionId(null);
        } else {
          setPendingWorkspaceSession(null);
        }
      }

      hydrateSession(targetSession
        ? {
          id: targetSession.id,
          title: targetSession.title,
          messages: targetSession.messages,
          conversation: targetSession.conversation,
          context: targetSession.context,
          trace: targetSession.trace,
        }
        : null);
    } catch (caught) {
      if (sessionsRequestIdRef.current === requestId) {
        setSessionsError(String(caught));
      }
    } finally {
      if (sessionsRequestIdRef.current === requestId) {
        setIsSessionsLoading(false);
      }
    }
  }, [
    closeSettingsAndContextPanels,
    hydrateSession,
    isActiveDefaultWorkspace,
    pendingDefaultSessionId,
    pendingWorkspaceSession,
    workspace.id,
    workspace.path,
  ]);

  const loadWorkspaceSidebarSessions = useCallback(async () => {
    if (!sidebarWorkspaces.length) {
      workspaceSidebarSessionsSignatureRef.current = "";
      setWorkspaceSessionsById({});
      setIsWorkspaceSessionsLoading(false);
      return;
    }
    if (workspaceSidebarSessionsSignatureRef.current === sidebarWorkspacesSignature) {
      return;
    }

    const requestId = workspaceSidebarSessionsRequestIdRef.current + 1;
    workspaceSidebarSessionsRequestIdRef.current = requestId;
    setIsWorkspaceSessionsLoading(true);
    setSessionsError("");

    try {
      const entries = await Promise.all(
        sidebarWorkspaces.map(async (item) => [
          item.id,
          await listChatSessions(item.path),
        ] as const),
      );
      if (workspaceSidebarSessionsRequestIdRef.current !== requestId) {
        return;
      }
      workspaceSidebarSessionsSignatureRef.current = sidebarWorkspacesSignature;
      setWorkspaceSessionsById(Object.fromEntries(
        entries.map(([workspaceId, sessions]) => [
          workspaceId,
          sortChatSessionsByFixedOrder(sessions),
        ]),
      ));
    } catch (caught) {
      if (workspaceSidebarSessionsRequestIdRef.current === requestId) {
        setSessionsError(String(caught));
      }
    } finally {
      if (workspaceSidebarSessionsRequestIdRef.current === requestId) {
        setIsWorkspaceSessionsLoading(false);
      }
    }
  }, [sidebarWorkspaces, sidebarWorkspacesSignature]);

  const loadDefaultSidebarSessions = useCallback(async () => {
    if (!defaultWorkspace || isActiveDefaultWorkspace) {
      return;
    }
    if (defaultSidebarSessionsWorkspaceIdRef.current === defaultWorkspace.id) {
      return;
    }

    const requestId = defaultSidebarSessionsRequestIdRef.current + 1;
    defaultSidebarSessionsRequestIdRef.current = requestId;
    setIsDefaultSessionsLoading(true);
    setSessionsError("");

    try {
      const sessions = await listChatSessions(defaultWorkspace.path);
      if (defaultSidebarSessionsRequestIdRef.current !== requestId) {
        return;
      }
      defaultSidebarSessionsWorkspaceIdRef.current = defaultWorkspace.id;
      setDefaultChatSessions(sortChatSessionsByFixedOrder(sessions));
    } catch (caught) {
      if (defaultSidebarSessionsRequestIdRef.current === requestId) {
        setSessionsError(String(caught));
      }
    } finally {
      if (defaultSidebarSessionsRequestIdRef.current === requestId) {
        setIsDefaultSessionsLoading(false);
      }
    }
  }, [defaultWorkspace, isActiveDefaultWorkspace]);

  useEffect(() => {
    if (isActiveDefaultWorkspace) {
      defaultSidebarSessionsWorkspaceIdRef.current = workspace.id;
      setDefaultChatSessions(chatSessions);
      return;
    }

    void loadDefaultSidebarSessions();
  }, [chatSessions, isActiveDefaultWorkspace, loadDefaultSidebarSessions, workspace.id]);

  useEffect(() => {
    void loadWorkspaceSidebarSessions();
  }, [loadWorkspaceSidebarSessions]);

  useEffect(() => {
    if (isActiveDefaultWorkspace) {
      return;
    }

    setWorkspaceSessionsById((current) => ({
      ...current,
      [workspace.id]: chatSessions,
    }));
  }, [chatSessions, isActiveDefaultWorkspace, workspace.id]);

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

  const loadSessionById = async (sessionId: string) => {
    closeSettingsAndContextPanels();

    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const session = await loadChatSession(workspace.path, sessionId);
      if (!session) {
        setSessionsError("未找到这条聊天记录");
        return;
      }
      hydrateSession({
        id: session.id,
        title: session.title,
        messages: session.messages,
        conversation: session.conversation,
        context: session.context,
        trace: session.trace,
      });
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const startNewSession = () => {
    closeSettingsAndContextPanels();

    setSessionsError("");
    setIsContextPanelOpen(false);
    setComposerResetKey((current) => current + 1);
    pendingAgentQuestionRef.current = null;
    agentQuestionAnswerRef.current = "";
    customAgentQuestionAnswerRef.current = "";
    setPendingAgentQuestion(null);
    setPendingDefaultSessionId(null);
    setPendingWorkspaceSession(null);
    pendingNewSessionWorkspaceIdRef.current = null;
    hydrateSession(null);
  };

  const removeSession = async (sessionId: string) => {
    if (isAgentTaskRunningForSession(workspace.path, sessionId)) {
      setSessionsError("Agent 正在处理，结束后再删除聊天记录");
      return;
    }

    const confirmed = window.confirm("永久删除该聊天记录？此操作不可恢复。");
    if (!confirmed) {
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const nextSessions = await deleteChatSession(workspace.path, sessionId);
      setChatSessions(nextSessions);
      if (currentSessionId === sessionId) {
        const latestSession = await loadChatSession(workspace.path);
        hydrateSession(latestSession
          ? {
            id: latestSession.id,
            title: latestSession.title,
            messages: latestSession.messages,
            conversation: latestSession.conversation,
            context: latestSession.context,
            trace: latestSession.trace,
          }
          : null);
      }
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const startSidebarSession = () => {
    startNewSession();
  };

  const openWorkspaceFromCurrentContext = useCallback((targetWorkspace: Workspace) => {
    if (targetWorkspace.id === workspace.id) {
      onOpenWorkspace(targetWorkspace);
      return;
    }

    if (
      messagesRef.current.length === 0 &&
      !pendingAgentQuestion &&
      !visibleActiveAgentTaskId
    ) {
      pendingNewSessionWorkspaceIdRef.current = targetWorkspace.id;
    } else {
      pendingNewSessionWorkspaceIdRef.current = null;
    }

    onOpenWorkspace(targetWorkspace);
  }, [onOpenWorkspace, pendingAgentQuestion, visibleActiveAgentTaskId, workspace.id]);

  const loadDefaultSessionById = async (sessionId: string) => {
    if (!isActiveDefaultWorkspace && defaultWorkspace) {
      pendingNewSessionWorkspaceIdRef.current = null;
      setPendingDefaultSessionId(sessionId);
      onOpenWorkspace(defaultWorkspace);
      return;
    }

    await loadSessionById(sessionId);
  };

  const loadWorkspaceSessionById = async (targetWorkspace: Workspace, sessionId: string) => {
    if (targetWorkspace.id === workspace.id) {
      pendingNewSessionWorkspaceIdRef.current = null;
      await loadSessionById(sessionId);
      return;
    }

    pendingNewSessionWorkspaceIdRef.current = null;
    setPendingWorkspaceSession({ workspaceId: targetWorkspace.id, sessionId });
    onOpenWorkspace(targetWorkspace);
  };

  const removeDefaultSession = async (sessionId: string) => {
    if (isActiveDefaultWorkspace) {
      await removeSession(sessionId);
      return;
    }

    if (!defaultWorkspace) {
      setSessionsError("默认工作区暂时不可用");
      return;
    }

    if (isAgentTaskRunningForSession(defaultWorkspace.path, sessionId)) {
      setSessionsError("Agent 正在处理，结束后再删除对话");
      return;
    }

    const confirmed = window.confirm("永久删除该对话？此操作不可恢复。");
    if (!confirmed) {
      return;
    }

    setIsDefaultSessionsLoading(true);
    setSessionsError("");

    try {
      const nextSessions = await deleteChatSession(defaultWorkspace.path, sessionId);
      setDefaultChatSessions(nextSessions);
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsDefaultSessionsLoading(false);
    }
  };

  const removeWorkspaceSession = async (targetWorkspace: Workspace, sessionId: string) => {
    if (targetWorkspace.id === workspace.id && !isActiveDefaultWorkspace) {
      await removeSession(sessionId);
      return;
    }

    if (isAgentTaskRunningForSession(targetWorkspace.path, sessionId)) {
      setSessionsError("Agent 正在处理，结束后再删除对话");
      return;
    }

    const confirmed = window.confirm("永久删除该对话？此操作不可恢复。");
    if (!confirmed) {
      return;
    }

    setIsWorkspaceSessionsLoading(true);
    setSessionsError("");

    try {
      const nextSessions = await deleteChatSession(targetWorkspace.path, sessionId);
      setWorkspaceSessionsById((current) => ({
        ...current,
        [targetWorkspace.id]: nextSessions,
      }));
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsWorkspaceSessionsLoading(false);
    }
  };

  useEffect(() => {
    setWorkspaceView("chat");
    setShowAllSessions(false);
  }, [workspace.id]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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
  }, [conversationContext]);

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

  useEffect(() => () => {
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (isHydratingSessionRef.current) {
      return;
    }

    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
    }

    if (messages.length === 0 && !currentSessionId) {
      return;
    }

    const title = messages.length === 0 ? currentSessionTitle : deriveSessionTitle(messages);
    if (title !== currentSessionTitle) {
      currentSessionTitleRef.current = title;
      setCurrentSessionTitle(title);
    }

    saveSessionTimerRef.current = window.setTimeout(() => {
      setIsSessionSaving(true);
      setSessionsError("");

      void saveChatSession({
        workspacePath: workspace.path,
        sessionId: currentSessionId,
        title,
        messages,
        conversation,
        context: conversationContext,
        trace: chatTrace,
      })
        .then((session) => {
          currentSessionIdRef.current = session.id;
          currentSessionTitleRef.current = session.title;
          setCurrentSessionId(session.id);
          setCurrentSessionTitle(session.title);
          setChatSessions((current) => {
            const nextMeta: ChatSessionMeta = {
              id: session.id,
              title: session.title,
              path: "",
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: session.messages.length,
            };
            return upsertChatSessionMeta(current, nextMeta);
          });
        })
        .catch((caught) => {
          setSessionsError(String(caught));
        })
        .finally(() => {
          setIsSessionSaving(false);
        });
    }, 700);
  }, [chatTrace, conversation, conversationContext, currentSessionId, currentSessionTitle, messages, workspace.path]);

  useEffect(() => {
    scrollActiveThinkingToBottom();
    scrollChatToBottom(messages.length > 2 ? "smooth" : "auto");
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
            agentExecutionSummary: executionSummary,
            agentRunStatus: status,
            agentSessionId,
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

        const contextBeforeFinalize = conversationContextRef.current;
        const finalizeContextStartedAt = Date.now();
        const syncedContext = await contextEngine.finalizeAgentRun({
          conversation: nextConversation,
          currentContext: contextBeforeFinalize,
          summarizer: conversationSummarizerRef.current,
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
            engineId: contextEngine.id,
            providerName: null,
            modelName: null,
            canUseModel: Boolean(conversationSummarizerRef.current),
          }));
        }
      })();

      return nextConversation;
    });

    return executionSummary;
  }, [agentRuntimeSessionId, agentSessionStatus, appendVisibleTraceStep, contextEngine, workspace.path]);

  const updateRunningAgentTaskMessage = useCallback((
    task: RunningAgentTaskContext,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    task.messages = task.messages.map((message) =>
      message.id === task.messageId ? updater(message) : message
    );
  }, []);

  const persistRunningAgentTask = useCallback(async (task: RunningAgentTaskContext) => {
    const title = deriveSessionTitle(task.messages);
    task.title = title;
    const session = await saveChatSession({
      workspacePath: task.workspacePath,
      sessionId: task.sessionId,
      title,
      messages: task.messages,
      conversation: task.conversation,
      context: task.context,
      trace: task.chatTrace,
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
        };
        return upsertChatSessionMeta(current, nextMeta);
      });
    }
  }, [workspace.path]);

  const appendRunningAgentTaskResult = useCallback((
    task: RunningAgentTaskContext,
    assistantText: string,
    status: "done" | "error",
    statusMessage?: string,
  ) => {
    const executionSummary = buildAgentExecutionSummary(
      task.trace,
      status,
      statusMessage,
    );
    const conversationContent = buildAgentConversationContent(assistantText);
    task.conversation = [
      ...task.conversation,
      {
        id: task.messageId,
        role: "assistant",
        content: conversationContent,
        timestamp: Date.now(),
        metadata: {
          agentExecutionSummary: executionSummary,
          agentRunStatus: status,
          agentSessionId: task.agentSessionId,
        },
      },
    ];
  }, []);

  const clearPendingAgentQuestion = useCallback((questionId: string) => {
    const currentQuestion = pendingAgentQuestionRef.current;
    if (currentQuestion?.questionId === questionId) {
      pendingAgentQuestionRef.current = null;
      agentQuestionAnswerRef.current = "";
      customAgentQuestionAnswerRef.current = "";
      setPendingAgentQuestion(null);
      setAgentQuestionAnswer("");
      setCustomAgentQuestionAnswer("");
    }

    runningAgentTasksRef.current.forEach((task) => {
      if (task.pendingQuestion?.questionId !== questionId) {
        return;
      }
      task.pendingQuestion = null;
      task.questionAnswer = "";
      task.customQuestionAnswer = "";
    });
  }, []);

  const handleBackgroundAgentEvent = useCallback((task: RunningAgentTaskContext, event: AgentRuntimeAgentEvent) => {
    recordAgentMemoryEvent(task.trace, event);
    const traceStep = agentEventTraceStep(event);
    if (traceStep) {
      appendRunningAgentTaskTraceStep(task, traceStep);
    }

    if (event.type === "text_delta") {
      updateRunningAgentTaskMessage(task, (message) => ({
        ...message,
        text: `${message.text}${event.delta}`,
        agentBlocks: updateLastAgentTextBlock(message, (content) => `${content}${event.delta}`),
        status: "streaming",
      }));
      return;
    }

    if (event.type === "thinking_delta") {
      updateRunningAgentTaskMessage(task, (message) => {
        const agentBlocks = updateLastAgentThinkingBlock(
          message,
          (content) => `${content}${event.delta}`,
        );
        return {
          ...message,
          thinking: mergeAgentThinking(agentBlocks),
          agentBlocks,
          status: "streaming",
        };
      });
      return;
    }

    if (event.type === "thinking_end") {
      updateRunningAgentTaskMessage(task, (message) => {
        const result = finalizeLastAgentThinkingBlock(message, event.content);
        return {
          ...message,
          thinking: mergeAgentThinking(result.blocks),
          agentBlocks: result.blocks,
          status: "streaming",
        };
      });
      return;
    }

    if (event.type === "replace_text") {
      updateRunningAgentTaskMessage(task, (message) => ({
        ...message,
        text: event.text,
        agentBlocks: updateLastAgentTextBlock(message, () => event.text),
        status: "streaming",
      }));
      return;
    }

    if (isTimelineEvent(event)) {
      updateRunningAgentTaskMessage(task, (message) => {
        let agentBlocks = message.agentBlocks;
        if (
          event.type === "tool_start" ||
          event.type === "tool_update" ||
          event.type === "tool_end"
        ) {
          agentBlocks = appendAgentToolEventBlock(message, event).blocks;
        }

        return {
          ...message,
          agentBlocks,
          agentEvents: [...(message.agentEvents ?? []), event].slice(-80),
          status: event.type === "error" ? "error" : message.status,
        };
      });
    }

    if (event.type === "stderr") {
      task.lastStderr = event.message;
      return;
    }

    if (event.type === "question") {
      task.pendingQuestion = pendingQuestionFromEvent(event);
      task.questionAnswer = event.input?.selected ?? "";
      task.customQuestionAnswer = "";
      return;
    }

    if (event.type === "question_answered") {
      clearPendingAgentQuestion(event.questionId);
      return;
    }

    if (event.type === "error") {
      if (task.handledTerminal) {
        return;
      }
      task.handledTerminal = true;
      task.lastError = event.message;
      updateRunningAgentTaskMessage(task, (message) => ({
        ...message,
        text: event.message,
        status: "error",
      }));
      appendRunningAgentTaskResult(task, event.message, "error", event.message);
      patchRunningAgentTaskTraceTurn(task, { status: "error" });
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
      return;
    }

    if (event.type === "done") {
      if (task.handledTerminal) {
        return;
      }
      task.handledTerminal = true;
      const assistantText = event.text.trim();
      const conversationText = assistantText || "Agent 任务已完成。";
      updateRunningAgentTaskMessage(task, (message) => {
        const text = assistantText || message.text || "Agent 任务已完成。";
        const hasTextBlock = message.agentBlocks?.some((block) => block.type === "text");
        const agentBlocks = removeEmptyAgentThinkingBlocks(message.agentBlocks);
        return {
          ...message,
          text,
          agentBlocks: hasTextBlock ? agentBlocks : updateLastAgentTextBlock({
            ...message,
            agentBlocks,
          }, () => text),
          status: "done",
        };
      });
      appendRunningAgentTaskResult(task, conversationText, "done");
      patchRunningAgentTaskTraceTurn(task, { status: "done" });
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
      return;
    }

    if (event.type === "exit" && !event.success) {
      if (task.handledTerminal) {
        return;
      }
      task.handledTerminal = true;
      const message =
        task.lastError ||
        task.lastStderr ||
        `Agent 任务异常退出：${event.code ?? "unknown"}`;
      updateRunningAgentTaskMessage(task, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
      appendRunningAgentTaskResult(task, message, "error", message);
      patchRunningAgentTaskTraceTurn(task, { status: "error" });
      removeRunningAgentTask(task.taskId);
      void persistRunningAgentTask(task);
    }
  }, [
    appendRunningAgentTaskResult,
    appendRunningAgentTaskTraceStep,
    clearPendingAgentQuestion,
    patchRunningAgentTaskTraceTurn,
    persistRunningAgentTask,
    removeRunningAgentTask,
    updateRunningAgentTaskMessage,
  ]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;

    void agentRuntime.subscribe((event) => {
      const currentTaskId = activeAgentTaskIdRef.current;
      const eventTaskId = event.taskId ?? currentTaskId;
      const taskContext = eventTaskId
        ? runningAgentTasksRef.current.get(eventTaskId)
        : undefined;
      const isEventForVisibleTask = !taskContext ||
        (taskContext.workspacePath === workspace.path && taskContext.sessionId === currentSessionIdRef.current);
      if (eventTaskId !== currentTaskId || !isEventForVisibleTask) {
        if (taskContext) {
          handleBackgroundAgentEvent(taskContext, event);
        }
        return;
      }

      const messageId = activeAgentMessageIdRef.current;
      if (!messageId) {
        if (taskContext) {
          handleBackgroundAgentEvent(taskContext, event);
        }
        return;
      }
      if (
        taskContext &&
        !messagesRef.current.some((message) => message.id === messageId)
      ) {
        restoreRunningAgentTaskView(taskContext);
      }

      recordAgentMemoryEvent(activeAgentTraceRef.current, event);
      const traceStep = agentEventTraceStep(event);
      if (taskContext && traceStep) {
        appendRunningAgentTaskTraceStep(taskContext, traceStep);
      }

      if (event.type === "text_delta") {
        updateMessage(messageId, (message) => {
          const text = `${message.text}${event.delta}`;
          return {
            ...message,
            text,
            agentBlocks: updateLastAgentTextBlock(message, (content) => `${content}${event.delta}`),
            status: "streaming",
          };
        });
        return;
      }

      if (event.type === "thinking_delta") {
        updateMessage(messageId, (message) => {
          const agentBlocks = updateLastAgentThinkingBlock(
            message,
            (content) => `${content}${event.delta}`,
          );
          return {
            ...message,
            thinking: mergeAgentThinking(agentBlocks),
            agentBlocks,
            status: "streaming",
          };
        });
        return;
      }

      if (event.type === "thinking_end") {
        let thinkingBlockId: string | null = null;
        updateMessage(messageId, (message) => {
          const result = finalizeLastAgentThinkingBlock(message, event.content);
          const agentBlocks = result.blocks;
          thinkingBlockId = result.blockId;
          return {
            ...message,
            thinking: mergeAgentThinking(agentBlocks),
            agentBlocks,
            status: "streaming",
          };
        });
        if (thinkingBlockId) {
          scheduleAgentBlockCollapse(messageId, thinkingBlockId);
        }
        return;
      }

      if (event.type === "replace_text") {
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.text,
          agentBlocks: updateLastAgentTextBlock(message, () => event.text),
          status: "streaming",
        }));
        return;
      }

      if (isTimelineEvent(event)) {
        let completedToolBlockId: string | null = null;
        updateMessage(messageId, (message) => {
          let agentBlocks = message.agentBlocks;
          if (
            event.type === "tool_start" ||
            event.type === "tool_update" ||
            event.type === "tool_end"
          ) {
            const result = appendAgentToolEventBlock(message, event);
            agentBlocks = result.blocks;
            completedToolBlockId = event.type === "tool_end" ? result.blockId : null;
          }

          return {
            ...message,
            agentBlocks,
            agentEvents: [...(message.agentEvents ?? []), event].slice(-80),
            status: event.type === "error" ? "error" : message.status,
          };
        });
        if (completedToolBlockId && event.type === "tool_end" && !event.isError) {
          scheduleAgentBlockCollapse(messageId, completedToolBlockId);
        }
      }

      if (event.type === "question") {
        const pendingQuestion = pendingQuestionFromEvent(event);
        if (taskContext) {
          taskContext.pendingQuestion = pendingQuestion;
          taskContext.questionAnswer = event.input?.selected ?? "";
          taskContext.customQuestionAnswer = "";
        }
        pendingAgentQuestionRef.current = pendingQuestion;
        agentQuestionAnswerRef.current = event.input?.selected ?? "";
        customAgentQuestionAnswerRef.current = "";
        setPendingAgentQuestion(pendingQuestion);
        setAgentQuestionAnswer(agentQuestionAnswerRef.current);
        setCustomAgentQuestionAnswer("");
        return;
      }

      if (event.type === "question_answered") {
        clearPendingAgentQuestion(event.questionId);
        return;
      }

      if (event.type === "done") {
        if (handledAgentDoneTaskIdsRef.current.has(event.taskId)) {
          return;
        }
        handledAgentDoneTaskIdsRef.current.add(event.taskId);

        const assistantText = event.text.trim();
        const conversationText = assistantText || "Agent 任务已完成。";
        updateMessage(messageId, (message) => {
          const text = assistantText || message.text || "Agent 任务已完成。";
          const hasTextBlock = message.agentBlocks?.some((block) => block.type === "text");
          const agentBlocks = removeEmptyAgentThinkingBlocks(message.agentBlocks);
          return {
            ...message,
            text,
            agentBlocks: hasTextBlock ? agentBlocks : updateLastAgentTextBlock({
              ...message,
              agentBlocks,
            }, () => text),
            status: "done",
          };
        });
        appendAgentConversationResult(conversationText, "done");
        if (taskContext) {
          patchRunningAgentTaskTraceTurn(taskContext, { status: "done" });
        }
        removeRunningAgentTask(event.taskId);
        setActiveAgentTaskId("");
        pendingAgentQuestionRef.current = null;
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void loadFiles();
        void refreshAgentSessionStatus();
      }

      if (event.type === "stderr") {
        lastAgentStderrRef.current = event.message;
      }

      if (event.type === "error") {
        const terminalTaskId = event.taskId ?? currentTaskId;
        if (terminalTaskId && handledAgentDoneTaskIdsRef.current.has(terminalTaskId)) {
          return;
        }
        if (terminalTaskId) {
          handledAgentDoneTaskIdsRef.current.add(terminalTaskId);
        }
        lastAgentErrorRef.current = event.message;
        setChatError(event.message);
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.message,
          status: "error",
        }));
        appendAgentConversationResult(event.message, "error", event.message);
        if (taskContext) {
          patchRunningAgentTaskTraceTurn(taskContext, { status: "error" });
        }
        if (terminalTaskId) {
          removeRunningAgentTask(terminalTaskId);
        }
        setActiveAgentTaskId("");
        pendingAgentQuestionRef.current = null;
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
        void refreshAgentSessionStatus();
      }

      if (event.type === "exit" && !event.success) {
        if (handledAgentDoneTaskIdsRef.current.has(event.taskId)) {
          return;
        }
        handledAgentDoneTaskIdsRef.current.add(event.taskId);
        const message =
          lastAgentErrorRef.current ||
          lastAgentStderrRef.current ||
          `Agent 任务异常退出：${event.code ?? "unknown"}`;
        setChatError(message);
        updateMessage(messageId, (currentMessage) => ({
          ...currentMessage,
          text: message,
          status: "error",
        }));
        appendAgentConversationResult(message, "error", message);
        if (taskContext) {
          patchRunningAgentTaskTraceTurn(taskContext, { status: "error" });
        }
        removeRunningAgentTask(event.taskId);
        setActiveAgentTaskId("");
        pendingAgentQuestionRef.current = null;
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void refreshAgentSessionStatus();
      }
    }).then((unsubscribe) => {
      if (disposed) {
        unsubscribe();
        return;
      }
      cleanup = unsubscribe;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [
    agentRuntime,
    appendAgentConversationResult,
    appendRunningAgentTaskTraceStep,
    clearPendingAgentQuestion,
    handleBackgroundAgentEvent,
    loadFiles,
    patchRunningAgentTaskTraceTurn,
    refreshAgentSessionStatus,
    removeRunningAgentTask,
    restoreRunningAgentTaskView,
    updateMessage,
    workspace.path,
  ]);

  useEffect(() => {
    if (visibleActiveAgentTaskId) {
      return;
    }

    setAgentRuntimeSessionId(contextEngine.getActiveAgentRuntimeSessionId(
      conversationContext,
      runtimeAgentId,
    ));
  }, [contextEngine, conversationContext, runtimeAgentId, visibleActiveAgentTaskId]);

  const compressConversationContext = useCallback(async () => {
    if (conversation.length === 0) {
      return;
    }

    const compressionStartedAt = Date.now();
    const previousContext = conversationContextRef.current ?? conversationContext;
    const latestTraceTurn = chatTraceRef.current[chatTraceRef.current.length - 1];
    setIsContextCompressing(true);
    setSessionsError("");

    try {
      const nextContext = await contextEngine.compressConversation({
        conversation,
        currentContext: conversationContext,
        modelContext: contextModelFor(effectiveProvider, effectiveModel),
        summarizer: summarizerFor(effectiveProvider, effectiveModel),
        canUseModel: runtimeAgentRequiresModel,
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
          engineId: contextEngine.id,
          providerName: effectiveProvider?.name ?? null,
          modelName: effectiveModel?.modelName ?? null,
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
            engineId: contextEngine.id,
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
    contextEngine,
    effectiveModel,
    effectiveProvider,
    runtimeAgentRequiresModel,
    summarizerFor,
  ]);

  const rebuildConversationContextAfterHistoryChange = useCallback(async (
    nextConversation: ConversationMessage[],
  ) => {
    const collaborationSummaryAgent = chatMode === "collab"
      ? selectedCollaborationWorkflow?.writerAgent ?? null
      : null;
    const summaryProvider = collaborationSummaryAgent
      ? collaborationSummaryAgent.provider
      : effectiveProvider;
    const summaryModel = collaborationSummaryAgent
      ? collaborationSummaryAgent.model
      : effectiveModel;
    const summarySummarizer = summarizerFor(summaryProvider, summaryModel);
    const contextPlan = contextEngine.createPlan({
      modelContext: contextModelFor(summaryProvider, summaryModel),
      summarizer: summarySummarizer,
      canUseModel: runtimeAgentRequiresModel,
    });
    const nextContext = await contextEngine.rebuildAfterHistoryChange({
      conversation: nextConversation,
      currentContext: conversationContextRef.current,
      modelContext: contextModelFor(summaryProvider, summaryModel),
      summarizer: summarySummarizer,
      canUseModel: runtimeAgentRequiresModel,
    });
    conversationSummarizerRef.current = contextPlan.summarizer ?? null;
    conversationContextRef.current = nextContext;
    setConversationContext(nextContext);
  }, [
    chatMode,
    contextModelFor,
    contextEngine,
    effectiveModel,
    effectiveProvider,
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
    const invalidatedContext = contextEngine.invalidateAfterHistoryChange(
      conversationContextRef.current,
      sanitizedConversation,
    );
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
    void rebuildConversationContextAfterHistoryChange(sanitizedConversation).catch((caught) => {
      setSessionsError(String(caught));
    });
  }, [
    contextEngine,
    currentSessionId,
    rebuildConversationContextAfterHistoryChange,
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
      setAgentQuestionAnswer("");
      setCustomAgentQuestionAnswer("");
    } catch (caught) {
      setChatError(String(caught));
    } finally {
      answeringAgentQuestionIdsRef.current.delete(pendingAgentQuestion.questionId);
      setIsAnsweringAgentQuestion(false);
    }
  };

  const answerAgentQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await submitAgentQuestionAnswer(
      agentQuestionAnswer === "other" ? customAgentQuestionAnswer : agentQuestionAnswer,
    );
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

    const collaborationWorkflow = chatMode === "collab" ? selectedCollaborationWorkflow : null;
    const collaborationWriterAgent = collaborationWorkflow?.writerAgent ?? null;
    const collaborationReviewerAgent = collaborationWorkflow?.reviewerAgent ?? null;

    if (chatMode === "collab" && (!collaborationWorkflow || !collaborationWriterAgent || !collaborationReviewerAgent)) {
      setChatError("请选择协作流程");
      return;
    }

    if (chatMode !== "collab" && runtimeAgentRequiresModel && (!effectiveProvider || !effectiveModel)) {
      setChatError("请选择要使用的 LLM 和模型");
      return;
    }

    if (unresolvedFileReferences.length > 0) {
      setChatError(`未找到引用文件：${unresolvedFileReferences.map((match) => `@${match.token}`).join("、")}`);
      return;
    }

    if (ambiguousFileReferences.length > 0) {
      setChatError(
        ambiguousFileReferences
          .map((match) => {
            const candidates = match.matches.slice(0, 5).map((file) => file.path).join("、");
            return `@${match.token} 匹配到多个文件：${candidates}`;
          })
          .join("\n"),
      );
      return;
    }

    let referencedFiles: ResolvedFileReference[] = [];
    try {
      referencedFiles = await Promise.all(
        referencedFilePreviews.map(async (file) => {
          const content = await readWorkspaceFile(workspace.path, file.path);
          return {
            path: content.path,
            content: content.content,
          };
        }),
      );
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
    const userMessage: ConversationMessage = {
      id: userMessageId,
      role: "user",
      content: text,
      timestamp: now,
    };
    const nextConversation = [...baseConversation, userMessage];
    const userUiMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      text,
      createdAt: now,
      referencedFiles: referencedFiles.map((file) => ({ path: file.path })),
    };
    const assistantUiMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      mode: chatMode,
      text: "",
      status: "loading",
      createdAt: now,
      agentAvatar: chatMode === "collab"
        ? collaborationWriterAgent?.avatar
        : modelSource === "agent" ? selectedAgent?.avatar : undefined,
      agentName: chatMode === "collab" && collaborationWorkflow
        ? collaborationWorkflow.name
        : modelSource === "agent" ? selectedAgent?.name : undefined,
      agentEvents: chatMode === "agent" ? [] : undefined,
      agentBlocks: chatMode === "agent" ? [] : undefined,
    };
    const traceTurnId = `${now}-${assistantMessageId}`;
    const traceProviderName = chatMode === "collab" && collaborationWriterAgent && collaborationReviewerAgent
      ? `${collaborationWriterAgent.provider.name} / ${collaborationReviewerAgent.provider.name}`
      : effectiveProvider?.name ?? null;
    const traceModelName = chatMode === "collab" && collaborationWriterAgent && collaborationReviewerAgent
      ? `${collaborationWriterAgent.model.modelName} / ${collaborationReviewerAgent.model.modelName}`
      : effectiveModel?.modelName ?? null;
    const traceTurn: ChatTraceTurn = {
      id: traceTurnId,
      mode: chatMode,
      status: "running",
      createdAt: now,
      updatedAt: now,
      userMessageId,
      assistantMessageId,
      userText: text,
      referencedFilePaths: referencedFiles.map((file) => file.path),
      activeFilePath: activeFile?.path ?? null,
      providerName: traceProviderName,
      modelName: traceModelName,
      runtimeAgentId,
      agentSessionId: null,
      contextEngineId: contextEngine.id,
      contextWindow: effectiveAppContextWindow,
      conversationSummary: baseConversationContext?.summary ?? "",
      steps: [
        createChatTraceStep({
          type: "input",
          label: "用户输入",
          status: "done",
          content: text,
          metadata: {
            mode: chatMode,
            modelSource,
            referencedFilePaths: referencedFiles.map((file) => file.path),
            activeFilePath: activeFile?.path ?? null,
          },
        }),
      ],
    };
    const nextSessionId = chatMode === "agent" && !currentSessionId
      ? createChatSessionId()
      : currentSessionId;

    if (nextSessionId && nextSessionId !== currentSessionId) {
      currentSessionIdRef.current = nextSessionId;
      setCurrentSessionId(nextSessionId);
    }
    const nextMessages = [...messagesRef.current, userUiMessage, assistantUiMessage];
    messagesRef.current = nextMessages;
    conversationRef.current = nextConversation;
    replaceChatTrace([...chatTraceRef.current, traceTurn]);
    setMessages(nextMessages);
    setConversation(nextConversation);
    setIsSending(true);
    setChatError("");

    try {
      const limitsFor = (
        provider?: LlmProvider | null,
        model?: ProviderModel | null,
      ) => contextEngine.createPlan({
        modelContext: contextModelFor(provider, model),
        canUseModel: false,
      }).limits;
      const summaryProvider = chatMode === "collab" && collaborationWriterAgent
        ? collaborationWriterAgent.provider
        : effectiveProvider;
      const summaryModel = chatMode === "collab" && collaborationWriterAgent
        ? collaborationWriterAgent.model
        : effectiveModel;
      const summaryModelContext = contextModelFor(summaryProvider, summaryModel);
      const summarySummarizer = summarizerFor(summaryProvider, summaryModel);
      const prepareContextStartedAt = Date.now();
      const preparedContext = await contextEngine.prepareConversation({
        conversation: nextConversation,
        currentContext: baseConversationContext,
        modelContext: summaryModelContext,
        summarizer: summarySummarizer,
        canUseModel: runtimeAgentRequiresModel,
      });
      const summaryLimits = preparedContext.limits;
      const summarizeConversation = preparedContext.summarizer;
      const nextConversationContext = preparedContext.context;
      const runtimeMessages = preparedContext.runtimeMessages;
      const conversationSummary = preparedContext.conversationSummary;
      conversationSummarizerRef.current = summarizeConversation ?? null;
      setConversationContext(nextConversationContext);
      conversationContextRef.current = nextConversationContext;
      patchVisibleTraceTurn(traceTurnId, {
        contextEngineId: contextEngine.id,
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
          engineId: contextEngine.id,
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
          engineId: contextEngine.id,
          providerName: summaryProvider?.name ?? null,
          modelName: summaryModel?.modelName ?? null,
          canUseModel: runtimeAgentRequiresModel,
        }));
      }
      const debugSnapshotBase: Omit<ContextDebugSnapshot, "payloads" | "updatedAt"> = {
        id: `${now}-${userMessageId}`,
        mode: chatMode,
        engineId: contextEngine.id,
        contextWindow: summaryModelContext.contextWindow ?? effectiveAppContextWindow,
        runtimeAgentId,
        agentSessionId: null,
        providerName: traceProviderName,
        modelName: traceModelName,
        activeFilePath: activeFile?.path ?? null,
        referencedFilePaths: referencedFiles.map((file) => file.path),
        enabledSkillNames,
        conversationSummary,
        runtimeMessages,
      };
      const publishContextDebugSnapshot = (
        payloads: ContextDebugPayload[],
        overrides: Partial<ContextDebugSnapshot> = {},
      ) => {
        setContextDebugSnapshot({
          ...debugSnapshotBase,
          updatedAt: Date.now(),
          payloads,
          ...overrides,
        });
      };
      const knowledgeMatches = contextEngine.capabilities.includes("rag_index")
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
          enabled: contextEngine.capabilities.includes("rag_index"),
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

      if (chatMode === "collab" && collaborationWorkflow && collaborationWriterAgent && collaborationReviewerAgent) {
        const workflowSteps = collaborationWorkflow.steps;
        if (workflowSteps.length === 0) {
          setChatError("协作流程没有可执行步骤");
          return;
        }

        const debugPayloads: ContextDebugPayload[] = [knowledgeDebugPayload];
        const stepOutputs: Array<{
          step: CollaborationWorkflowStepProfile;
          text: string;
          thinking?: string;
        }> = [];
        const renderStepOutput = (
          step: CollaborationWorkflowStepProfile,
          stepText: string,
        ) => `## ${step.agent.name}：${step.name}\n\n${stepText}`;
        const renderProgressText = (nextStep?: CollaborationWorkflowStepProfile) => [
          ...stepOutputs.map((output) => renderStepOutput(output.step, output.text)),
          nextStep
            ? `## ${nextStep.agent.name}：${nextStep.name}中\n\n正在执行 ${nextStep.name}...`
            : "",
        ].filter(Boolean).join("\n\n");
        const renderPriorOutputs = () => stepOutputs
          .map((output, index) => [
            `## 步骤 ${index + 1}：${output.step.name}`,
            `角色：${output.step.agent.name}`,
            output.text,
          ].join("\n"))
          .join("\n\n");

        for (const [index, step] of workflowSteps.entries()) {
          const promptPhase = promptPhaseForWorkflowStep(step);
          setCollaborationPhase(visiblePhaseForWorkflowStep(step, index, workflowSteps.length));
          const stepMessages = index === 0
            ? runtimeMessages
            : contextEngine.selectConversationMessages([
              ...nextConversation,
              {
                id: createMessageId(),
                role: "assistant",
                content: `协作流程前序步骤输出：\n\n${renderPriorOutputs()}`,
                timestamp: Date.now(),
              },
            ], nextConversationContext, summaryLimits);
          const systemPrompt = buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            step.agent,
            promptPhase,
            {
              limits: limitsFor(step.agent.provider, step.agent.model),
              conversationSummary,
              agentExecutionSummary: currentAgentExecutionSummary,
              contextQuery: text,
              knowledgeMatches,
              collaborationInstruction: step.instruction,
              collaborationStepName: step.name,
              collaborationStepIndex: index + 1,
              collaborationStepCount: workflowSteps.length,
            },
          );
          debugPayloads.push(
            { label: `step ${index + 1} systemPrompt`, content: systemPrompt },
            { label: `step ${index + 1} messages`, content: formatDebugMessages(stepMessages) },
          );
          publishContextDebugSnapshot(debugPayloads, {
            providerName: step.agent.provider.name,
            modelName: step.agent.model.modelName,
          });
          const stepStartedAt = Date.now();
          appendVisibleTraceStep(traceTurnId, {
            type: "request",
            label: `${step.name}模型请求`,
            status: "done",
            content: systemPrompt,
            metadata: {
              phase: promptPhase,
              stepIndex: index + 1,
              stepName: step.name,
              providerName: step.agent.provider.name,
              modelName: step.agent.model.modelName,
              stream: false,
            },
            payloads: [
              {
                label: "messages",
                content: formatDebugMessages(stepMessages),
              },
            ],
          });
          const stepResult = await runAgentRuntimeChat({
            agentId: runtimeAgentId,
            provider: step.agent.provider,
            model: step.agent.model,
            stream: false,
            systemPrompt,
            messages: stepMessages,
          });
          const stepText = stepResult.text.trim();
          stepOutputs.push({
            step,
            text: stepText,
            thinking: stepResult.thinking?.trim() || undefined,
          });
          appendVisibleTraceStep(traceTurnId, {
            type: "response",
            label: `${step.name}模型响应`,
            startedAt: stepStartedAt,
            endedAt: Date.now(),
            status: "done",
            content: stepText,
            metadata: {
              phase: promptPhase,
              stepIndex: index + 1,
              stepName: step.name,
              thinkingLength: stepResult.thinking?.length ?? 0,
            },
            payloads: stepResult.thinking?.trim()
              ? [{ label: "thinking", content: stepResult.thinking.trim() }]
              : undefined,
          });
          updateMessage(assistantMessageId, (message) => ({
            ...message,
            text: renderProgressText(workflowSteps[index + 1]),
            thinking: stepOutputs.map((output) => output.thinking).filter(Boolean).join("\n\n") || undefined,
            status: index === workflowSteps.length - 1 ? "done" : "streaming",
          }));
        }

        const finalOutput = stepOutputs.at(-1);
        if (!finalOutput) {
          setChatError("协作流程没有生成结果");
          return;
        }
        const previousOutputs = stepOutputs.slice(0, -1);
        const collaborationText = [
          renderStepOutput(finalOutput.step, finalOutput.text),
          ...previousOutputs.flatMap((output, index) => [
            "",
            "<details>",
            `<summary>步骤 ${index + 1}：${output.step.agent.name} ${output.step.name}</summary>`,
            "",
            output.text,
            "",
            "</details>",
          ]),
        ].join("\n\n");

        updateMessage(assistantMessageId, (message) => ({
          ...message,
          text: collaborationText,
          thinking: stepOutputs.map((output) => output.thinking).filter(Boolean).join("\n\n") || undefined,
          status: "done",
        }));
        const finalConversation: ConversationMessage[] = [
          ...nextConversation,
          {
            id: assistantMessageId,
            role: "assistant",
            content: collaborationText,
            timestamp: Date.now(),
          },
        ];
        conversationRef.current = finalConversation;
        setConversation(finalConversation);
        const finalizeContextStartedAt = Date.now();
        const contextBeforeFinalize = conversationContextRef.current;
        const finalContext = await contextEngine.finalizeChatTurn({
          conversation: finalConversation,
          currentContext: contextBeforeFinalize,
          modelContext: contextModelFor(summaryProvider, summaryModel),
          summarizer: summarizeConversation,
          canUseModel: runtimeAgentRequiresModel,
        });
        conversationContextRef.current = finalContext;
        setConversationContext(finalContext);
        if (didConversationContextCompress(contextBeforeFinalize, finalContext)) {
          appendVisibleTraceStep(traceTurnId, contextCompressionTraceStep({
            startedAt: finalizeContextStartedAt,
            previousContext: contextBeforeFinalize,
            nextContext: finalContext,
            conversationLength: finalConversation.length,
            mode: "collab",
            phase: "finalize",
            engineId: contextEngine.id,
            providerName: summaryProvider?.name ?? null,
            modelName: summaryModel?.modelName ?? null,
            canUseModel: runtimeAgentRequiresModel,
          }));
        }
        appendVisibleTraceStep(traceTurnId, {
          type: "context",
          label: "上下文回写",
          status: "done",
          content: finalContext?.summary ?? "（空）",
          metadata: {
            mode: "collab",
            conversationLength: finalConversation.length,
          },
        });
        patchVisibleTraceTurn(traceTurnId, {
          status: "done",
          conversationSummary: finalContext?.summary ?? conversationSummary,
        });
        setCollaborationPhase("idle");
        return;
      }

      if (runtimeAgentRequiresModel && (!effectiveProvider || !effectiveModel)) {
        setChatError("请选择要使用的 LLM 和模型");
        return;
      }

      if (chatMode === "agent") {
        if (!nextSessionId) {
          setChatError("无法创建 Agent 长期上下文，请重试");
          return;
        }
        const agentLimits = limitsFor(effectiveProvider, effectiveModel);
        const agentSessionPlan = contextEngine.planAgentRun({
          chatSessionId: nextSessionId,
          conversation: baseConversation,
          currentContext: baseConversationContext,
          agentId: runtimeAgentId,
          tokenBudget: agentLimits.recentHistoryTokens,
          isHistoryInvalidated: agentContextInvalidatedRef.current,
        });
        const agentSessionId = agentSessionPlan.agentSessionId;
        patchVisibleTraceTurn(traceTurnId, {
          agentSessionId,
        });
        activeAgentMessageIdRef.current = assistantMessageId;
        activeAgentSessionIdRef.current = agentSessionId;
        activeAgentIdRef.current = runtimeAgentId;
        setAgentRuntimeSessionId(agentSessionId);
        const taskTrace = createAgentMemoryTrace();
        activeAgentTraceRef.current = taskTrace;
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        if (agentSessionResetPromiseRef.current) {
          const resetSucceeded = await agentSessionResetPromiseRef.current;
          if (!resetSucceeded) {
            throw new Error("无法重置旧 Agent 长期上下文，已停止本次运行以避免复用旧记忆。");
          }
        }
        let currentAgentSessionStatus = agentSessionStatus;
        try {
          currentAgentSessionStatus = await getAgentSessionStatus(workspace.path, agentSessionId);
          setAgentSessionStatus(currentAgentSessionStatus);
        } catch (caught) {
          setAgentSessionError(String(caught));
        }
        const agentPromptPayload = contextEngine.buildAgentPromptPayload({
          conversation: baseConversation,
          currentContext: baseConversationContext,
          sessionPlan: agentSessionPlan,
          agentSessionStatus: currentAgentSessionStatus,
          text,
          references: referencedFiles,
          knowledgeMatches,
          selectedAgent: modelSource === "agent" ? selectedAgent : null,
          limits: agentLimits,
        });
        publishContextDebugSnapshot([
          knowledgeDebugPayload,
          {
            label: "bridge initial prompt",
            content: formatAgentInitialPromptPreview(
              agentPromptPayload.bootstrapContext,
              agentPromptPayload.prompt,
              agentPromptPayload.shouldBootstrapAgentContext,
            ),
          },
          {
            label: "bootstrapContext",
            content: agentPromptPayload.bootstrapContext || "（空）",
          },
          {
            label: "prompt",
            content: agentPromptPayload.prompt,
          },
          {
            label: "prompt recent_conversation",
            content: formatDebugMessages(agentPromptPayload.promptHistory.recentMessages),
          },
          {
            label: "bootstrap recent_conversation",
            content: formatDebugMessages(agentPromptPayload.bootstrapHistory.recentMessages),
          },
        ], {
          mode: "agent",
          agentSessionId,
          providerName: effectiveProvider?.name ?? null,
          modelName: effectiveModel?.modelName ?? null,
          conversationSummary: agentPromptPayload.promptHistory.summary ||
            agentPromptPayload.bootstrapHistory.summary ||
            conversationSummary,
          runtimeMessages: agentPromptPayload.promptHistory.recentMessages,
        });
        appendVisibleTraceStep(traceTurnId, {
          type: "request",
          label: "Agent bridge 请求",
          status: "done",
          content: agentPromptPayload.prompt,
          metadata: {
            agentSessionId,
            agentId: runtimeAgentId,
            providerName: effectiveProvider?.name ?? null,
            modelName: effectiveModel?.modelName ?? null,
            shouldBootstrapAgentContext: agentPromptPayload.shouldBootstrapAgentContext,
            allowedTools: normalizeAllowedAgentTools(allowedAgentTools),
            enabledSkills: enabledSkills.map((skill) => skill.name),
          },
          payloads: [
            {
              label: "bootstrapContext",
              content: agentPromptPayload.bootstrapContext || "（空）",
            },
            {
              label: "prompt recent_conversation",
              content: formatDebugMessages(agentPromptPayload.promptHistory.recentMessages),
            },
            {
              label: "bootstrap recent_conversation",
              content: formatDebugMessages(agentPromptPayload.bootstrapHistory.recentMessages),
            },
          ],
        });
        const agentRunStartedAt = Date.now();
        const task = await agentRuntime.run({
          type: "agent",
          agentId: runtimeAgentId,
          workspacePath: workspace.path,
          chatSessionId: agentSessionId,
          bootstrapContext: agentPromptPayload.bootstrapContext,
          prompt: agentPromptPayload.prompt,
          provider: effectiveProvider ? toAgentRuntimeProviderConfig(effectiveProvider) : undefined,
          model: effectiveProvider && effectiveModel
            ? runtimeModelFor(effectiveProvider, effectiveModel)
            : undefined,
          allowedTools: normalizeAllowedAgentTools(allowedAgentTools),
          enabledSkills: enabledSkills.map((skill) => skill.name),
        });
        handledAgentDoneTaskIdsRef.current.delete(task.taskId);
        appendVisibleTraceStep(traceTurnId, {
          type: "agent_event",
          label: "Agent 任务创建",
          startedAt: agentRunStartedAt,
          endedAt: Date.now(),
          status: "done",
          metadata: {
            taskId: task.taskId,
            agentSessionId,
            agentId: runtimeAgentId,
          },
        });
        addRunningAgentTask({
          taskId: task.taskId,
          workspacePath: workspace.path,
          sessionId: nextSessionId,
          title: currentSessionTitle,
          messageId: assistantMessageId,
          traceTurnId,
          chatTrace: chatTraceRef.current,
          agentSessionId,
          agentId: runtimeAgentId,
          trace: taskTrace,
          messages: nextMessages,
          conversation: nextConversation,
          context: nextConversationContext,
          pendingQuestion: null,
          questionAnswer: "",
          customQuestionAnswer: "",
          lastError: "",
          lastStderr: "",
          handledTerminal: false,
        });
        activeAgentTaskIdRef.current = task.taskId;
        setActiveAgentTaskId(task.taskId);
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          status: "streaming",
        }));
        return;
      }

      const systemPrompt = buildSystemPrompt(
        workspace,
        activeFile,
        referencedFiles,
        enabledSkills,
        modelSource === "agent" ? selectedAgent : null,
        {
          limits: limitsFor(effectiveProvider, effectiveModel),
          conversationSummary,
          agentExecutionSummary: currentAgentExecutionSummary,
          contextQuery: text,
          knowledgeMatches,
        },
      );
      publishContextDebugSnapshot([
        knowledgeDebugPayload,
        { label: "systemPrompt", content: systemPrompt },
        { label: "messages", content: formatDebugMessages(runtimeMessages) },
      ]);
      const chatRequestStartedAt = Date.now();
      let hasLoggedStreamStart = false;
      appendVisibleTraceStep(traceTurnId, {
        type: "request",
        label: "模型请求",
        status: "done",
        content: systemPrompt,
        metadata: {
          providerName: effectiveProvider?.name ?? null,
          modelName: effectiveModel?.modelName ?? null,
          stream: true,
          runtimeMessageCount: runtimeMessages.length,
        },
        payloads: [
          {
            label: "messages",
            content: formatDebugMessages(runtimeMessages),
          },
        ],
      });
      const result = await runAgentRuntimeChat({
        agentId: runtimeAgentId,
        provider: effectiveProvider,
        model: effectiveModel,
        systemPrompt,
        messages: runtimeMessages,
        onTextDelta: (delta) => {
          if (!hasLoggedStreamStart) {
            hasLoggedStreamStart = true;
            appendVisibleTraceStep(traceTurnId, {
              type: "stream",
              label: "开始流式输出",
              status: "done",
              content: delta,
            });
          }
          updateMessage(assistantMessageId, (message) => ({
            ...message,
            text: `${message.text}${delta}`,
            status: "streaming",
          }));
        },
        onThinkingDelta: (delta) => {
          if (!hasLoggedStreamStart) {
            hasLoggedStreamStart = true;
            appendVisibleTraceStep(traceTurnId, {
              type: "stream",
              label: "开始流式输出",
              status: "done",
              content: delta,
            });
          }
          updateMessage(assistantMessageId, (message) => ({
            ...message,
            thinking: `${message.thinking ?? ""}${delta}`,
            status: "streaming",
          }));
        },
      });
      const assistantText = result.text.trim();
      appendVisibleTraceStep(traceTurnId, {
        type: "response",
        label: "模型响应",
        startedAt: chatRequestStartedAt,
        endedAt: Date.now(),
        status: "done",
        content: assistantText,
        metadata: {
          thinkingLength: result.thinking?.length ?? 0,
          textLength: assistantText.length,
        },
        payloads: result.thinking?.trim()
          ? [{ label: "thinking", content: result.thinking.trim() }]
          : undefined,
      });

      updateMessage(assistantMessageId, (message) => ({
        ...message,
        text: assistantText,
        thinking: result.thinking?.trim() || undefined,
        status: "done",
      }));
      const finalConversation: ConversationMessage[] = [
        ...nextConversation,
        {
          id: assistantMessageId,
          role: "assistant",
          content: assistantText,
          timestamp: Date.now(),
        },
      ];
      conversationRef.current = finalConversation;
      setConversation(finalConversation);
      const finalizeContextStartedAt = Date.now();
      const contextBeforeFinalize = conversationContextRef.current;
      const finalContext = await contextEngine.finalizeChatTurn({
        conversation: finalConversation,
        currentContext: contextBeforeFinalize,
        modelContext: contextModelFor(summaryProvider, summaryModel),
        summarizer: summarizeConversation,
        canUseModel: runtimeAgentRequiresModel,
      });
      conversationContextRef.current = finalContext;
      setConversationContext(finalContext);
      if (didConversationContextCompress(contextBeforeFinalize, finalContext)) {
        appendVisibleTraceStep(traceTurnId, contextCompressionTraceStep({
          startedAt: finalizeContextStartedAt,
          previousContext: contextBeforeFinalize,
          nextContext: finalContext,
          conversationLength: finalConversation.length,
          mode: "chat",
          phase: "finalize",
          engineId: contextEngine.id,
          providerName: summaryProvider?.name ?? null,
          modelName: summaryModel?.modelName ?? null,
          canUseModel: runtimeAgentRequiresModel,
        }));
      }
      appendVisibleTraceStep(traceTurnId, {
        type: "context",
        label: "上下文回写",
        status: "done",
        content: finalContext?.summary ?? "（空）",
        metadata: {
          mode: "chat",
          conversationLength: finalConversation.length,
        },
      });
      patchVisibleTraceTurn(traceTurnId, {
        status: "done",
        conversationSummary: finalContext?.summary ?? conversationSummary,
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
      activeAgentTaskIdRef.current = "";
      activeAgentMessageIdRef.current = "";
      setActiveAgentTaskId("");
      updateMessage(assistantMessageId, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
      if (chatMode === "agent") {
        appendAgentConversationResult(message, "error", message);
        activeAgentSessionIdRef.current = "";
        activeAgentIdRef.current = "";
        activeAgentTraceRef.current = createAgentMemoryTrace();
      }
    } finally {
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
    agentQuestionAnswer,
    customAgentQuestionAnswer,
    isAnsweringAgentQuestion,
    files,
    composerResetKey,
    isSending,
    activeAgentTaskId: visibleActiveAgentTaskId,
    isSettingsLoading,
    chatMode,
    contextWindowPreset,
    effectiveContextWindow: effectiveAppContextWindow,
    availableRuntimeAgents,
    selectedRuntimeAgent,
    runtimeAgentId,
    agentProfiles,
    providers,
    selectedProviderId,
    selectedModel,
    collaborationWorkflows,
    selectedCollaborationWorkflow,
    selectedCollaborationWorkflowId,
    allowedAgentTools,
    toggleThinking,
    toggleAgentEvents,
    toggleAgentThinkingBlock,
    toggleAgentBlock,
    onEditHistoryMessage: editHistoryMessage,
    onDeleteHistoryMessage: deleteHistoryMessage,
    onMoveHistoryMessage: moveHistoryMessage,
    onOpenWorkspace: openWorkspaceFromCurrentContext,
    onCreateWorkspace,
    answerAgentQuestion,
    setAgentQuestionAnswer,
    setCustomAgentQuestionAnswer,
    submitAgentQuestionAnswer,
    setChatMode,
    setContextWindowPreset,
    setModelSource,
    setSelectedRuntimeAgentId,
    setSelectedAgentId,
    setSelectedCollaborationWorkflowId,
    setSelectedProviderId,
    setSelectedModelId,
    toggleAllowedAgentTool,
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

  const settingsPanel = (
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
      providers={providers}
      onBack={() => setWorkspaceView("chat")}
      onContextEngineChange={changeContextEngine}
    />
  );

  useContextPanelStoreBridge({
    selectableFileCount: selectableFiles.length,
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
    chatMode,
    collaborationPhase,
    selectedAgent: chatMode === "collab" ? selectedCollaborationWorkflow?.writerAgent ?? null : selectedAgent,
    reviewerAgent: chatMode === "collab" ? selectedCollaborationWorkflow?.reviewerAgent ?? null : null,
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

  return (
    <main className="flex h-screen min-h-screen overflow-hidden bg-background text-foreground">
      <SkillsDialog
        open={isSkillsDialogOpen}
        skills={skills}
        enabledSkillNames={enabledSkillNames}
        isLoading={isSkillsLoading}
        isSaving={isSkillsSaving}
        error={skillsError}
        onOpenChange={handleSkillsDialogOpenChange}
        onToggleSkill={toggleWorkspaceSkill}
        onSave={() => void saveSkills()}
      />
      <SettingsDialog
        open={isLlmSettingsOpen}
        onOpenChange={(open) => {
          setIsLlmSettingsOpen(open);
          if (!open) {
            void loadLlmOptions();
          }
        }}
      />
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
      <Sidebar
        workspace={workspace}
        workspaces={sidebarWorkspaces}
        activeSessionId={currentSessionId}
        defaultCurrentSessionId={isActiveDefaultWorkspace ? currentSessionId : null}
        defaultCurrentSessionTitle={isActiveDefaultWorkspace ? currentSessionTitle : DEFAULT_SESSION_TITLE}
        hasUnsavedDefaultSession={isActiveDefaultWorkspace && messages.length > 0 && !currentSessionId}
        workspaceCurrentSessionTitle={!isActiveDefaultWorkspace ? currentSessionTitle : DEFAULT_SESSION_TITLE}
        hasUnsavedWorkspaceSession={!isActiveDefaultWorkspace && messages.length > 0 && !currentSessionId}
        isProjectsLoading={isWorkspaceOverviewLoading}
        projectsError={workspaceOverviewError}
        isDefaultSessionsLoading={isActiveDefaultWorkspace ? isSessionsLoading : isDefaultSessionsLoading}
        isWorkspaceSessionsLoading={(!isActiveDefaultWorkspace && isSessionsLoading) || isWorkspaceSessionsLoading}
        defaultChatSessions={sidebarChatSessions}
        visibleDefaultSessions={visibleSidebarSessions}
        defaultWorkspacePath={defaultWorkspace?.path ?? workspace.path}
        workspaceSessionsById={workspaceSessionsById}
        isAgentSessionRunning={isAgentTaskRunningForSession}
        suppressDefaultLoadingState={!isActiveDefaultWorkspace && (
          isSending ||
          messages.length > 0 ||
          Boolean(currentSessionId) ||
          Boolean(visibleActiveAgentTaskId)
        )}
        showAllSessions={showAllSessions}
        isKnowledgeOpen={workspaceView === "knowledge"}
        onOpenWorkspace={openWorkspaceFromCurrentContext}
        onEditWorkspace={onEditWorkspace}
        onStartNewSession={startSidebarSession}
        onOpenContext={openContextWorkbench}
        onOpenSkills={() => setIsSkillsDialogOpen(true)}
        onOpenKnowledge={() => {
          setIsContextWorkbenchOpen(false);
          setIsLlmSettingsOpen(false);
          setIsAgentSettingsOpen(false);
          setIsCollaborationWorkflowSettingsOpen(false);
          setWorkspaceView("knowledge");
        }}
        onLoadDefaultSession={(sessionId) => void loadDefaultSessionById(sessionId)}
        onRemoveDefaultSession={(sessionId) => void removeDefaultSession(sessionId)}
        onLoadWorkspaceSession={(targetWorkspace, sessionId) => void loadWorkspaceSessionById(targetWorkspace, sessionId)}
        onRemoveWorkspaceSession={(targetWorkspace, sessionId) => void removeWorkspaceSession(targetWorkspace, sessionId)}
        onToggleShowAllSessions={() => setShowAllSessions((current) => !current)}
        onOpenSettings={openSettingsPanel}
      />

      <WorkbenchHeader
        isContextPanelOpen={isContextPanelOpen}
        showToggle={workspaceView === "chat"}
        versionStatus={versionStatus}
        isVersionControlLoading={isVersionControlLoading}
        isVersionControlInitializing={isVersionControlInitializing}
        isCreatingVersionBranch={isCreatingVersionBranch}
        switchingVersionBranchName={switchingVersionBranchName}
        onToggleContextPanel={() => setIsContextPanelOpen((current) => !current)}
        onRefreshVersionControl={() => void loadVersionControl()}
        onInitializeVersionControl={() => void initializeVersionControl()}
        onCreateVersionBranch={(branchName) => void createVersionBranch(branchName)}
        onSwitchVersionBranch={(branchName) => void switchVersionBranch(branchName)}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-background pt-12">
        <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/20">
          <div className="min-w-0 flex-1 overflow-hidden bg-background/95 shadow-[inset_8px_0_24px_-28px_rgb(15_23_42_/_0.35),inset_-8px_0_24px_-28px_rgb(15_23_42_/_0.28)]">
            {workspaceView === "settings" ? (
              settingsPanel
            ) : workspaceView === "knowledge" ? (
              knowledgePanel
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
            )}
          </div>

          {isContextPanelOpen && workspaceView === "chat" && (
            <ContextPanel />
          )}
        </div>
      </section>
    </main>
  );
};
