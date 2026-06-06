import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ALLOWED_AGENT_TOOLS,
  normalizeAllowedAgentTools,
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
  type AgentMemoryTrace,
  type ContextRagMatch,
  type ConversationSummarizer,
  type PromptContextLimits,
} from "@/ai/agent-context";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import { CollaborationWorkflowSettingsDialog } from "@/features/agent-settings/components/collaboration-workflow-dialog";
import { AgentSettingsDialog } from "@/features/agent-settings/components/dialog";
import type {
  CollaborationWorkflowProfile,
  CollaborationWorkflowStepProfile,
} from "@/features/agent-settings/types";
import { SettingsDialog } from "@/features/llm-settings/components/dialog";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { KnowledgeBasePage } from "@/features/knowledge-base/components/knowledge-base-page";
import { createGlobalKnowledgeRagIndex } from "@/features/knowledge-base/rag-index";
import { SkillsDialog } from "@/features/workspace-skills/components/skills-dialog";
import type { Workspace, WorkspaceSection } from "@/features/workspaces/types";
import {
  cleanupOrphanAgentSessions,
  getAgentSessionStatus,
  readWorkspaceFile,
  resetAgentSessionsForChat,
  runAgentRuntimeChat,
  saveChatSession,
} from "../../api";
import type {
  ChatExecutionMode,
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
  formatAgentInitialPromptPreview,
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
  filterChatAgentAllowedTools,
  isAgentTaskMode,
} from "../../utils/chat-mode";
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
import { useAgentRuntimeEvents } from "./use-agent-runtime-events";
import { useContextModeling } from "./use-context-modeling";
import { useFileWorkbench } from "./use-file-workbench";
import { useModelSettings } from "./use-model-settings";
import { useRunningAgentTasks } from "./use-running-agent-tasks";
import { useChatTraceState } from "./use-chat-trace-state";
import { useWorkspaceChatSessions } from "./use-workspace-chat-sessions";
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

type LimitsForProvider = (
  provider?: LlmProvider | null,
  model?: ProviderModel | null,
) => PromptContextLimits;

type PublishContextDebugSnapshot = (
  payloads: ContextDebugPayload[],
  overrides?: Partial<ContextDebugSnapshot>,
) => void;

type FinalizeAssistantTurn = (input: {
  mode: "chat" | "collab";
  assistantText: string;
}) => Promise<void>;

type CollaborationStepOutput = {
  step: CollaborationWorkflowStepProfile;
  text: string;
  thinking?: string;
};

const defaultToolCallProcessByMode: Record<ChatMode, boolean> = {
  chat: false,
  agent: true,
  collab: true,
};

type RunCollaborationTurnInput = {
  collaborationWorkflow: CollaborationWorkflowProfile;
  traceTurnId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  nextConversation: ConversationMessage[];
  nextConversationContext: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  summaryLimits: PromptContextLimits;
  conversationSummary: string;
  currentAgentExecutionSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
  finalizeAssistantTurn: FinalizeAssistantTurn;
};

type RunAgentTurnInput = {
  nextSessionId: string | null;
  traceTurnId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  baseConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  nextConversation: ConversationMessage[];
  nextConversationContext: ChatContextSummary | null;
  nextMessages: ChatMessage[];
  conversationSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
};

type RunChatTurnInput = {
  traceTurnId: string;
  assistantMessageId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
  currentAgentExecutionSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
  finalizeAssistantTurn: FinalizeAssistantTurn;
};

type PrepareChatTurnRuntimeInput = {
  now: number;
  userMessageId: string;
  assistantMessageId: string;
  traceTurnId: string;
  text: string;
  referencedFiles: ResolvedFileReference[];
  nextConversation: ConversationMessage[];
  baseConversationContext: ChatContextSummary | null;
  traceProviderName: string | null;
  traceModelName: string | null;
  summaryProvider: LlmProvider | null;
  summaryModel: ProviderModel | null;
};

type PreparedChatTurnRuntime = {
  summaryLimits: PromptContextLimits;
  nextConversationContext: ChatContextSummary | null;
  runtimeMessages: ConversationMessage[];
  conversationSummary: string;
  knowledgeMatches: ContextRagMatch[];
  knowledgeDebugPayload: ContextDebugPayload;
  limitsFor: LimitsForProvider;
  publishContextDebugSnapshot: PublishContextDebugSnapshot;
  finalizeAssistantTurn: FinalizeAssistantTurn;
};

type CommitChatTurnDraftInput = Pick<
  ChatTurnDraft,
  "nextConversation" | "userUiMessage" | "assistantUiMessage" | "traceTurn"
> & {
  nextSessionId: string | null;
};

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

const renderCollaborationStepOutput = (
  step: CollaborationWorkflowStepProfile,
  stepText: string,
) => `## ${step.agent.name}：${step.name}\n\n${stepText}`;

const renderCollaborationProgressText = (
  stepOutputs: CollaborationStepOutput[],
  nextStep?: CollaborationWorkflowStepProfile,
) => [
  ...stepOutputs.map((output) => renderCollaborationStepOutput(output.step, output.text)),
  nextStep
    ? `## ${nextStep.agent.name}：${nextStep.name}中\n\n正在执行 ${nextStep.name}...`
    : "",
].filter(Boolean).join("\n\n");

const renderCollaborationPriorOutputs = (
  stepOutputs: CollaborationStepOutput[],
) => stepOutputs
  .map((output, index) => [
    `## 步骤 ${index + 1}：${output.step.name}`,
    `角色：${output.step.agent.name}`,
    output.text,
  ].join("\n"))
  .join("\n\n");

const renderCollaborationFinalText = (
  stepOutputs: CollaborationStepOutput[],
) => {
  const finalOutput = stepOutputs.at(-1);
  if (!finalOutput) {
    return null;
  }

  const previousOutputs = stepOutputs.slice(0, -1);
  return [
    renderCollaborationStepOutput(finalOutput.step, finalOutput.text),
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
  const [chatMode, setChatMode] = useState<ChatMode>("chat");
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
  const [contextWindowPreset, setContextWindowPreset] = useState<ContextWindowPreset>("auto");
  const [allowedAgentTools, setAllowedAgentTools] = useState<AgentToolName[]>(() => [
    ...DEFAULT_ALLOWED_AGENT_TOOLS,
  ]);
  const [, setCollaborationPhase] = useState<CollaborationPhase>("idle");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [isContextWorkbenchOpen, setIsContextWorkbenchOpen] = useState(false);
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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState(DEFAULT_SESSION_TITLE);
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
    chatExecutionMode,
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
    setMessages(task.messages);
    setConversation(task.conversation);
    setConversationContext(task.context);
    setContextEngineId(getContextEngine(
      task.context?.engine?.id ?? preferredContextEngineIdRef.current,
    ).id);
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
      currentTask.context = conversationContextRef.current;
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

    const nextMessages = [...messagesRef.current, userUiMessage, assistantUiMessage];
    messagesRef.current = nextMessages;
    conversationRef.current = nextConversation;
    replaceChatTrace([...chatTraceRef.current, traceTurn]);
    setMessages(nextMessages);
    setConversation(nextConversation);
    setIsSending(true);
    setChatError("");

    return nextMessages;
  };

  const runCollaborationTurn = async ({
    collaborationWorkflow,
    traceTurnId,
    assistantMessageId,
    text,
    referencedFiles,
    nextConversation,
    nextConversationContext,
    runtimeMessages,
    summaryLimits,
    conversationSummary,
    currentAgentExecutionSummary,
    knowledgeMatches,
    knowledgeDebugPayload,
    limitsFor,
    publishContextDebugSnapshot,
    finalizeAssistantTurn,
  }: RunCollaborationTurnInput) => {
    const workflowSteps = collaborationWorkflow.steps;
    if (workflowSteps.length === 0) {
      setChatError("协作流程没有可执行步骤");
      return;
    }

    const debugPayloads: ContextDebugPayload[] = [knowledgeDebugPayload];
    const stepOutputs: CollaborationStepOutput[] = [];

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
            content: `协作流程前序步骤输出：\n\n${renderCollaborationPriorOutputs(stepOutputs)}`,
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
        text: renderCollaborationProgressText(stepOutputs, workflowSteps[index + 1]),
        thinking: stepOutputs.map((output) => output.thinking).filter(Boolean).join("\n\n") || undefined,
        status: index === workflowSteps.length - 1 ? "done" : "streaming",
      }));
    }

    const collaborationText = renderCollaborationFinalText(stepOutputs);
    if (!collaborationText) {
      setChatError("协作流程没有生成结果");
      return;
    }

    updateMessage(assistantMessageId, (message) => ({
      ...message,
      text: collaborationText,
      thinking: stepOutputs.map((output) => output.thinking).filter(Boolean).join("\n\n") || undefined,
      status: "done",
    }));
    await finalizeAssistantTurn({
      mode: "collab",
      assistantText: collaborationText,
    });
  };

  const runAgentTurn = async ({
    nextSessionId,
    traceTurnId,
    assistantMessageId,
    text,
    referencedFiles,
    baseConversation,
    baseConversationContext,
    nextConversation,
    nextConversationContext,
    nextMessages,
    conversationSummary,
    knowledgeMatches,
    knowledgeDebugPayload,
    limitsFor,
    publishContextDebugSnapshot,
  }: RunAgentTurnInput) => {
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
    const taskTrace = createAgentMemoryTrace();
    prepareActiveAgentRun({
      messageId: assistantMessageId,
      agentSessionId,
      agentId: runtimeAgentId,
      trace: taskTrace,
    });
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
    const allowedToolsForRun = normalizeAllowedAgentTools(
      chatMode === "chat" && chatExecutionMode === "agent"
        ? filterChatAgentAllowedTools(allowedAgentTools)
        : allowedAgentTools,
    );
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
      mode: chatMode,
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
        allowedTools: allowedToolsForRun,
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
      allowedTools: allowedToolsForRun,
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
    activateAgentTaskId(task.taskId);
    updateMessage(assistantMessageId, (message) => ({
      ...message,
      status: "streaming",
    }));
  };

  const runChatTurn = async ({
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
  }: RunChatTurnInput) => {
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
    let pendingTextDelta = "";
    let pendingThinkingDelta = "";
    let streamFlushFrameId: number | null = null;
    const flushStreamDeltas = () => {
      streamFlushFrameId = null;
      const textDelta = pendingTextDelta;
      const thinkingDelta = pendingThinkingDelta;
      pendingTextDelta = "";
      pendingThinkingDelta = "";

      if (!textDelta && !thinkingDelta) {
        return;
      }

      updateMessage(assistantMessageId, (message) => ({
        ...message,
        text: textDelta ? `${message.text}${textDelta}` : message.text,
        thinking: thinkingDelta ? `${message.thinking ?? ""}${thinkingDelta}` : message.thinking,
        status: "streaming",
      }));
    };
    const scheduleStreamFlush = () => {
      if (streamFlushFrameId === null) {
        streamFlushFrameId = window.requestAnimationFrame(flushStreamDeltas);
      }
    };
    const flushPendingStreamDeltas = () => {
      if (streamFlushFrameId !== null) {
        window.cancelAnimationFrame(streamFlushFrameId);
      }
      flushStreamDeltas();
    };
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
        pendingTextDelta += delta;
        scheduleStreamFlush();
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
        pendingThinkingDelta += delta;
        scheduleStreamFlush();
      },
    });
    flushPendingStreamDeltas();
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
    await finalizeAssistantTurn({
      mode: "chat",
      assistantText,
    });
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
    summaryProvider,
    summaryModel,
  }: PrepareChatTurnRuntimeInput): Promise<PreparedChatTurnRuntime> => {
    const limitsFor: LimitsForProvider = (
      provider?: LlmProvider | null,
      model?: ProviderModel | null,
    ) => contextEngine.createPlan({
      modelContext: contextModelFor(provider, model),
      canUseModel: false,
    }).limits;
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
    const finalizeAssistantTurn: FinalizeAssistantTurn = async ({
      mode,
      assistantText,
    }) => {
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
          mode,
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
      effectiveProvider,
      effectiveModel,
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
      ? `${collaborationWriterAgent.provider.name} / ${collaborationReviewerAgent.provider.name}`
      : effectiveProvider?.name ?? null;
    const traceModelName = chatMode === "collab" && collaborationWriterAgent && collaborationReviewerAgent
      ? `${collaborationWriterAgent.model.modelName} / ${collaborationReviewerAgent.model.modelName}`
      : effectiveModel?.modelName ?? null;
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
      contextEngineId: contextEngine.id,
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
      assistantUiMessage,
      traceTurn,
    });

    try {
      const summaryProvider = chatMode === "collab" && collaborationWriterAgent
        ? collaborationWriterAgent.provider
        : effectiveProvider;
      const summaryModel = chatMode === "collab" && collaborationWriterAgent
        ? collaborationWriterAgent.model
        : effectiveModel;
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
        summaryProvider,
        summaryModel,
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
          nextConversationContext,
          runtimeMessages,
          summaryLimits,
          conversationSummary,
          currentAgentExecutionSummary,
          knowledgeMatches,
          knowledgeDebugPayload,
          limitsFor,
          publishContextDebugSnapshot,
          finalizeAssistantTurn,
        });
        return;
      }

      if (runtimeAgentRequiresModel && (!effectiveProvider || !effectiveModel)) {
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
          baseConversationContext,
          nextConversation,
          nextConversationContext,
          nextMessages,
          conversationSummary,
          knowledgeMatches,
          knowledgeDebugPayload,
          limitsFor,
          publishContextDebugSnapshot,
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
    chatExecutionMode,
    showThinkingProcess,
    showToolCallProcess,
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
    setChatExecutionMode,
    setShowThinkingProcess,
    setShowToolCallProcess,
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
        defaultWorkspacePath={defaultWorkspace?.path ?? workspace.path}
        workspaceSessionsById={workspaceSessionsById}
        isAgentSessionRunning={isAgentTaskRunningForSession}
        suppressDefaultLoadingState={!isActiveDefaultWorkspace && (
          isSending ||
          messages.length > 0 ||
          Boolean(currentSessionId) ||
          Boolean(visibleActiveAgentTaskId)
        )}
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
