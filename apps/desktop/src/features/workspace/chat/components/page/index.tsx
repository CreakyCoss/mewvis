import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Folder } from "lucide-react";
import {
  DEFAULT_ALLOWED_RUNTIME_AGENT_TOOLS,
  normalizeAllowedRuntimeAgentTools,
  type RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import {
  buildAgentConversationContent,
  buildAgentExecutionSummary,
  createAgentMemoryTrace,
  type AgentMemoryTrace,
} from "@/ai/agent-runtime/memory";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import { CollaborationWorkflowSettingsDialog } from "@/features/ai/components/workflow-setting/components/dialog";
import { AgentSettingsDialog } from "@/features/ai/components/agent-setting/components/dialog";
import { SettingsPanel } from "@/features/app/settings";
import { LlmSettingsPage } from "@/features/ai/components/llm-setting";
import { requireRuntimeModelInput } from "@/features/ai/components/llm-setting/store";
import {
  compactAgentRuntimeSession,
  deleteAgentRuntimeSessionMessage,
  editAgentRuntimeSessionMessage,
  readAgentRuntimeSession,
  rebuildAgentRuntimeSession,
} from "@/features/ai/components/conversation-ledger/api";
import { ConversationLedger } from "@/features/ai/components/conversation-ledger";
import type {
  AgentRuntimeSessionMessageInput,
  AgentRuntimeSessionResult,
  ConversationLedgerHandle,
} from "@/features/ai/components/conversation-ledger/types";
import { FileManage, type FileManageHandle } from "@/features/ai/components/file-manage";
import { KnowledgeBasePage } from "@/features/knowledge-base/components/knowledge-base-page";
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
  listWorkspaceFiles,
  saveChatSession,
} from "../../api";
import type {
  ComposerSubmitInput,
  PendingAgentQuestion,
  WorkspaceView,
} from "../../page-types";
import type {
  AgentSessionStatus,
  ChatContextSummary,
  ChatMessage,
  ChatSessionMeta,
  ConversationMessage,
  WorkspaceFile,
  WorkspaceFileEntry,
} from "../../types";
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
  type ChatTurnDraft,
  createChatTurnDraft,
  validateComposerSubmit,
} from "./chat-turn";
import {
  createBridgeSessionRootDir,
  createChatSessionId,
  createMessageId,
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
} from "../../utils/sessions";
import {
  runAgentTurn,
} from "./modes/agent-mode-runner";
import { buildWorkspaceAgentInteractionInstructions } from "./modes/agent-prompts";
import { prepareBridgeAgentTurnRuntime } from "./bridge-agent-turn-runtime";
import { ContextWorkbenchDialog } from "../context-workbench/dialog";
import { ChatPanel } from "../chat";
import { useChatPanelStoreBridge } from "../chat/store";
import { useAgentBlockState } from "./use-agent-block-state";
import { useAgentRuntimeEvents } from "./use-agent-runtime-events";
import { useContextModeling } from "./use-context-modeling";
import { useModelSettings } from "./use-model-settings";
import { useRunningAgentTasks } from "./use-running-agent-tasks";
import { useChatTraceState } from "./use-chat-trace-state";
import { useWorkspaceChatSessions } from "./use-workspace-chat-sessions";
import { useWorkspaceSkills } from "./use-workspace-skills";

type ContextPanelTool = "files" | "ledger";

type AgentBridgeSessionRef = {
  sessionRootDir: string;
  userMessageRecordId?: string | null;
  assistantMessageRecordId?: string | null;
} | null | undefined;

const contextPanelTools: Array<{
  value: ContextPanelTool;
  label: string;
  icon: typeof Folder;
}> = [
  { value: "files", label: "文件", icon: Folder },
  { value: "ledger", label: "链路", icon: Activity },
];

const contextPanelToolButtonClass =
  "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

type ContextPanelShellProps = {
  activeTool: ContextPanelTool;
  children: ReactNode;
  onChangeTool: (tool: ContextPanelTool) => void;
};

const ContextPanelShell = ({
  activeTool,
  children,
  onChangeTool,
}: ContextPanelShellProps) => (
  <div className="relative flex min-w-0 shrink-0 overflow-visible">
    {children}
    <nav
      className="flex w-12 shrink-0 flex-col items-center gap-2 border-l border-border/60 bg-muted/35 px-1.5 py-3"
      aria-label="右侧工具"
    >
      {contextPanelTools.map((tool) => {
        const Icon = tool.icon;

        return (
          <button
            key={tool.value}
            type="button"
            className={contextPanelToolButtonClass}
            title={tool.label}
            aria-label={`显示${tool.label}`}
            aria-pressed={activeTool === tool.value}
            data-active={activeTool === tool.value}
            onClick={() => onChangeTool(tool.value)}
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </nav>
  </div>
);

const contextFromBridgeSessionSummary = (
  summary: string,
): ChatContextSummary | null => summary
  ? {
    summary,
    summarizedUntilIndex: 0,
    updatedAt: Date.now(),
  }
  : null;

const bridgeMessagesFromChatMessages = (
  messages: ChatMessage[],
): AgentRuntimeSessionMessageInput[] => messages
  .map((message) => ({
    role: message.role,
    content: message.text.trim(),
    timestamp: message.createdAt,
    metadata: {
      source: "app-ui-message",
      uiMessageId: message.id,
      mode: message.mode ?? null,
      agentName: message.agentName ?? null,
    },
  }))
  .filter((message) => message.content.length > 0);

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
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const activeAgentTaskIdRef = useRef("");
  const activeAgentMessageIdRef = useRef("");
  const activeAgentSessionIdRef = useRef("");
  const activeAgentIdRef = useRef("");
  const lastAgentErrorRef = useRef("");
  const lastAgentStderrRef = useRef("");
  const handledAgentDoneTaskIdsRef = useRef<Set<string>>(new Set());
  const activeAgentTraceRef = useRef<AgentMemoryTrace>(createAgentMemoryTrace());
  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationRef = useRef<ConversationMessage[]>([]);
  const conversationContextRef = useRef<ChatContextSummary | null>(null);
  const fileManageRef = useRef<FileManageHandle>(null);
  const conversationLedgerRef = useRef<ConversationLedgerHandle>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const currentSessionTitleRef = useRef(DEFAULT_SESSION_TITLE);
  const pendingAgentQuestionRef = useRef<PendingAgentQuestion | null>(null);
  const agentQuestionAnswerRef = useRef("");
  const customAgentQuestionAnswerRef = useRef("");
  const answeringAgentQuestionIdsRef = useRef<Set<string>>(new Set());
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
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [chatError, setChatError] = useState("");
  const [showThinkingProcess, setShowThinkingProcess] = useState(true);
  const [showToolCallProcess, setShowToolCallProcess] = useState(true);
  const [allowedAgentTools, setAllowedAgentTools] = useState<RuntimeAgentToolName[]>(() => [
    ...DEFAULT_ALLOWED_RUNTIME_AGENT_TOOLS,
  ]);
  const [selectedSkillGroupIds, setSelectedSkillGroupIds] = useState<string[]>([
    ALL_SKILLS_GROUP_ID,
  ]);
  const skillGroupSelectionTouchedRef = useRef(false);
  const skillGroupWorkspaceRef = useRef(workspace.id);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [contextPanelTool, setContextPanelTool] =
    useState<ContextPanelTool>("files");
  const [isTavernRoomImmersive, setIsTavernRoomImmersive] = useState(false);
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
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
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
    isSettingsLoading,
    selectedRuntimeModel,
    availableRuntimeAgents,
    selectedRuntimeAgent,
    setSelectedRuntimeAgentId,
    runtimeAgentId,
    runtimeAgentRequiresModel,
    agentProfiles,
    selectedAgent,
    effectiveRuntimeModel,
    loadLlmOptions,
  } = useModelSettings({
    agentRuntime,
  });
  const tavernDefaultRuntimeModel = useMemo(
    () => runtimeModels[0] ?? null,
    [runtimeModels],
  );
  const {
    contextModelFor,
    effectiveAppContextWindow,
  } = useContextModeling({
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
  const refreshWorkspaceFiles = useCallback(async () => {
    try {
      const nextFiles = await listWorkspaceFiles(workspace.path);
      setFiles(nextFiles);
    } catch {
      setFiles([]);
    }
  }, [workspace.path]);

  useEffect(() => {
    setActiveFile(null);
    setFiles([]);
    void refreshWorkspaceFiles();
  }, [refreshWorkspaceFiles, workspace.id]);

  const refreshFileSurfaces = useCallback(async () => {
    await refreshWorkspaceFiles();
    fileManageRef.current?.refresh();
  }, [refreshWorkspaceFiles]);

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
    chatTraceRef,
    replaceChatTrace,
    appendVisibleTraceStep,
    patchVisibleTraceTurn,
    appendRunningAgentTaskTraceStep,
    patchRunningAgentTaskTraceTurn,
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
    setMessages(task.messages);
    setConversation(task.conversation);
    setConversationContext(task.context);
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

  const toggleAllowedAgentTool = useCallback((toolId: RuntimeAgentToolName, enabled: boolean) => {
    setAllowedAgentTools((current) => {
      if (enabled) {
        return current.includes(toolId) ? current : normalizeAllowedRuntimeAgentTools([...current, toolId]);
      }

      return current.filter((item) => item !== toolId);
    });
  }, []);

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
    setConversation,
    conversationRef,
    setConversationContext,
    conversationContextRef,
    replaceChatTrace,
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
  }, [conversationContext]);

  const conversationLedgerRuntimeModel = useMemo(() => {
    if (!effectiveRuntimeModel) {
      return null;
    }

    try {
      return requireRuntimeModelInput(effectiveRuntimeModel);
    } catch {
      return null;
    }
  }, [effectiveRuntimeModel]);

  const refreshConversationLedger = useCallback(() => {
    void conversationLedgerRef.current?.refresh();
  }, []);

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
    bridgeSession?: AgentBridgeSessionRef,
  ) => {
    const agentSessionId = activeAgentSessionIdRef.current || agentRuntimeSessionId || "";
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
        if (agentSessionId) {
          try {
            const latestAgentSessionStatus = await getAgentSessionStatus(workspace.path, agentSessionId);
            setAgentSessionStatus(latestAgentSessionStatus);
            setAgentSessionError("");
          } catch (caught) {
            setAgentSessionError(String(caught));
          }
        }

        const bridgeSessionRootDir = bridgeSession?.sessionRootDir ??
          createBridgeSessionRootDir(currentSessionId);
        if (!bridgeSessionRootDir) {
          return;
        }

        const contextReadStartedAt = Date.now();
        try {
          const bridgeContext = await readAgentRuntimeSession({
            workspacePath: workspace.path,
            sessionRootDir: bridgeSessionRootDir,
          });
          refreshConversationLedger();
          const syncedContext = contextFromBridgeSessionSummary(bridgeContext?.summary ?? "");
          conversationContextRef.current = syncedContext;
          setConversationContext(syncedContext);
          if (traceTurnId) {
            appendVisibleTraceStep(traceTurnId, {
              type: "context",
              label: "Bridge 上下文回读",
              startedAt: contextReadStartedAt,
              endedAt: Date.now(),
              status: "done",
              content: bridgeContext?.summary || "（空）",
              metadata: {
                sessionRootDir: bridgeSessionRootDir,
                source: "bridge-ledger",
                runStatus: status,
              },
            });
          }
        } catch (caught) {
          setSessionsError(String(caught));
        }
      })();

      return nextConversation;
    });

    return executionSummary;
  }, [
    agentRuntimeSessionId,
    appendVisibleTraceStep,
    currentSessionId,
    refreshConversationLedger,
    workspace.path,
  ]);

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
    loadFiles: refreshFileSurfaces,
    refreshAgentSessionStatus,
  });

  const compressConversationContext = useCallback(async () => {
    const bridgeSessionRootDir = createBridgeSessionRootDir(currentSessionId);
    if (!bridgeSessionRootDir) {
      return;
    }
    const activeAgentSessionId = activeAgentSessionIdRef.current;
    const [activeRuntimeAgentId, activeAgentRoleId] = activeAgentSessionId.split("/");
    if (!activeRuntimeAgentId || !activeAgentRoleId) {
      setSessionsError("请先运行一个 Agent，再压缩该 Agent 的底层上下文。");
      return;
    }
    const runtimeModelInput = effectiveRuntimeModel
      ? requireRuntimeModelInput(effectiveRuntimeModel)
      : null;

    const compressionStartedAt = Date.now();
    const latestTraceTurn = chatTraceRef.current[chatTraceRef.current.length - 1];
    setIsContextCompressing(true);
    setSessionsError("");

    try {
      const result = await compactAgentRuntimeSession({
        workspacePath: workspace.path,
        sessionRootDir: bridgeSessionRootDir,
        agentId: activeRuntimeAgentId,
        agentRoleId: activeAgentRoleId,
        runtimeModel: runtimeModelInput,
      });
      refreshConversationLedger();
      if (latestTraceTurn) {
        appendVisibleTraceStep(latestTraceTurn.id, {
          type: "context",
          label: "Agent 上下文压缩",
          startedAt: compressionStartedAt,
          endedAt: Date.now(),
          status: "done",
          content: result?.compacted ? "底层 Agent session 已压缩。" : "底层 Agent session 暂无可压缩内容。",
          metadata: {
            mode: "manual",
            source: "agent-session",
            sessionRootDir: bridgeSessionRootDir,
            agentId: activeRuntimeAgentId,
            agentRoleId: activeAgentRoleId,
            compacted: result?.compacted ?? false,
          },
        });
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
            source: "agent-session",
            sessionRootDir: bridgeSessionRootDir,
          },
        });
      }
      setSessionsError(message);
    } finally {
      setIsContextCompressing(false);
    }
  }, [
    appendVisibleTraceStep,
    currentSessionId,
    effectiveRuntimeModel,
    refreshConversationLedger,
    workspace.path,
  ]);

  const syncBridgeRebuildResult = useCallback((
    sourceMessages: ChatMessage[],
    result: AgentRuntimeSessionResult | null,
  ) => {
    if (!result) {
      return;
    }
    refreshConversationLedger();

    const recordIdsByMessageId = new Map<string, string | null>();
    let entryIndex = 0;
    for (const message of sourceMessages) {
      if (!message.text.trim()) {
        continue;
      }
      recordIdsByMessageId.set(message.id, result.messageRecordIds?.[entryIndex] ?? null);
      entryIndex += 1;
    }

    setMessages((currentMessages) => {
      const nextMessages = currentMessages.map((message) => {
        if (!recordIdsByMessageId.has(message.id)) {
          return message;
        }
        return {
          ...message,
          bridgeMessageRecordId: recordIdsByMessageId.get(message.id) ?? null,
        };
      });
      messagesRef.current = nextMessages;
      return nextMessages;
    });

    const nextContext = contextFromBridgeSessionSummary(result.summary);
    conversationContextRef.current = nextContext;
    setConversationContext(nextContext);
  }, [refreshConversationLedger]);

  const rebuildBridgeSessionFromMessages = useCallback((
    nextMessages: ChatMessage[],
  ) => {
    const bridgeSessionRootDir = createBridgeSessionRootDir(currentSessionId);
    if (!bridgeSessionRootDir) {
      return;
    }

    void rebuildAgentRuntimeSession({
      workspacePath: workspace.path,
      sessionRootDir: bridgeSessionRootDir,
      messages: bridgeMessagesFromChatMessages(nextMessages),
    }).then((result) => {
      syncBridgeRebuildResult(nextMessages, result);
    }).catch((caught) => {
      setSessionsError(String(caught));
    });
  }, [
    currentSessionId,
    syncBridgeRebuildResult,
    workspace.path,
  ]);

  const applyHistoryChange = useCallback((
    nextMessages: ChatMessage[],
  ) => {
    if (visibleActiveAgentTaskId) {
      setSessionsError("Agent 正在处理，结束后再修改历史记录");
      return false;
    }

    setSessionsError("");
    const sanitizedConversation = stripHiddenAgentContextMetadata(
      rebuildConversationFromVisibleMessages(
        conversationRef.current,
        messagesRef.current,
        nextMessages,
      ),
    );
    conversationContextRef.current = null;
    setConversationContext(null);
    setAgentRuntimeSessionId(null);
    setAgentSessionStatus(null);
    setAgentSessionError("");
    messagesRef.current = nextMessages;
    conversationRef.current = sanitizedConversation;
    setMessages(nextMessages);
    setConversation(sanitizedConversation);
    return true;
  }, [
    visibleActiveAgentTaskId,
  ]);

  const editHistoryMessage = useCallback((messageId: string, nextText: string) => {
    const content = nextText.trim();
    if (!content) {
      setSessionsError("消息内容不能为空，可以使用删除操作移除这条消息");
      return;
    }

    const currentMessages = messagesRef.current;
    const editedMessage = currentMessages.find((message) => message.id === messageId);
    const bridgeMessageRecordId = editedMessage?.bridgeMessageRecordId ?? null;
    const bridgeSessionRootDir = createBridgeSessionRootDir(currentSessionId);
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

    if (!applyHistoryChange(nextMessages)) {
      return;
    }

    if (bridgeMessageRecordId && bridgeSessionRootDir) {
      void editAgentRuntimeSessionMessage({
        workspacePath: workspace.path,
        sessionRootDir: bridgeSessionRootDir,
        messageRecordId: bridgeMessageRecordId,
        content,
      }).then((result) => {
        if (!result) {
          return;
        }
        refreshConversationLedger();
        const nextContext = contextFromBridgeSessionSummary(result.summary);
        conversationContextRef.current = nextContext;
        setConversationContext(nextContext);
        if (result.messageRecordId) {
          updateMessage(messageId, (message) => ({
            ...message,
            bridgeMessageRecordId: result.messageRecordId ?? message.bridgeMessageRecordId,
          }));
        }
      }).catch(() => {
        rebuildBridgeSessionFromMessages(nextMessages);
      });
    } else {
      rebuildBridgeSessionFromMessages(nextMessages);
    }
  }, [
    applyHistoryChange,
    currentSessionId,
    refreshConversationLedger,
    rebuildBridgeSessionFromMessages,
    updateMessage,
    workspace.path,
  ]);

  const deleteHistoryMessage = useCallback((messageId: string) => {
    const currentMessages = messagesRef.current;
    const deletedIndex = currentMessages.findIndex((message) => message.id === messageId);
    const deletedMessage = deletedIndex >= 0 ? currentMessages[deletedIndex] : null;
    if (!deletedMessage) {
      return;
    }
    const segmentStartIndex =
      deletedMessage.role === "assistant" && currentMessages[deletedIndex - 1]?.role === "user"
        ? deletedIndex - 1
        : deletedIndex;
    const bridgeTargetMessage = currentMessages[segmentStartIndex] ?? deletedMessage;
    const bridgeMessageRecordId = bridgeTargetMessage.bridgeMessageRecordId ?? null;
    const bridgeSessionRootDir = createBridgeSessionRootDir(currentSessionId);
    const nextMessages = removeHistoryMessageSegment(currentMessages, messageId);

    if (!applyHistoryChange(nextMessages)) {
      return;
    }

    if (bridgeMessageRecordId && bridgeSessionRootDir) {
      void deleteAgentRuntimeSessionMessage({
        workspacePath: workspace.path,
        sessionRootDir: bridgeSessionRootDir,
        messageRecordId: bridgeMessageRecordId,
      }).then((result) => {
        if (!result) {
          return;
        }
        refreshConversationLedger();
        const nextContext = contextFromBridgeSessionSummary(result.summary);
        conversationContextRef.current = nextContext;
        setConversationContext(nextContext);
      }).catch(() => {
        rebuildBridgeSessionFromMessages(nextMessages);
      });
    } else {
      rebuildBridgeSessionFromMessages(nextMessages);
    }
  }, [
    applyHistoryChange,
    currentSessionId,
    refreshConversationLedger,
    rebuildBridgeSessionFromMessages,
    workspace.path,
  ]);

  const moveHistoryMessage = useCallback((
    messageId: string,
    direction: "up" | "down",
  ) => {
    const nextMessages = moveHistoryItem(messagesRef.current, messageId, direction);
    if (!applyHistoryChange(nextMessages)) {
      return;
    }
    rebuildBridgeSessionFromMessages(nextMessages);
  }, [applyHistoryChange, rebuildBridgeSessionFromMessages]);
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

  const sendMessage = async ({
    text,
    referencedFilePreviews,
    unresolvedFileReferences,
    ambiguousFileReferences,
  }: ComposerSubmitInput) => {
    if (!text || isSending || visibleActiveAgentTaskId) {
      return;
    }

    const submitValidation = validateComposerSubmit({
      runtimeAgentRequiresModel,
      effectiveRuntimeModel,
      unresolvedFileReferences,
      ambiguousFileReferences,
    });
    if (!submitValidation.ok) {
      setChatError(submitValidation.error);
      return;
    }
    const referencedFileDescriptors = referencedFilePreviews.map((file) => ({
      path: file.path,
    }));

    const draftReferencedFiles = referencedFileDescriptors;

    const now = Date.now();
    const userMessageId = createMessageId();
    const assistantMessageId = createMessageId();
    const baseConversation = conversationRef.current;
    const baseConversationContext = conversationContextRef.current;
    const currentAgentExecutionSummary = findLatestAgentExecutionSummary(baseConversation);
    const traceProviderName = effectiveRuntimeModel?.provider.name ?? null;
    const traceModelName = effectiveRuntimeModel?.modelName ?? null;
    const {
      nextConversation,
      userUiMessage,
      assistantUiMessage,
      traceTurnId,
      traceTurn,
    } = createChatTurnDraft({
      now,
      text,
      modelSource,
      referencedFiles: draftReferencedFiles,
      baseConversation,
      baseConversationContext,
      activeFilePath: activeFile?.path ?? null,
      assistantAgentAvatar: modelSource === "agent" ? selectedAgent?.avatar : undefined,
      assistantAgentName: modelSource === "agent" ? selectedAgent?.name : undefined,
      providerName: traceProviderName,
      modelName: traceModelName,
      runtimeAgentId,
      contextWindow: effectiveAppContextWindow,
      userMessageId,
      assistantMessageId,
    });
    const nextSessionId = currentSessionId ?? createChatSessionId();
    const nextMessages = commitChatTurnDraft({
      nextSessionId,
      nextConversation,
      userUiMessage,
      assistantUiMessage,
      traceTurn,
    });

    try {
      const agentModelContext = contextModelFor(effectiveRuntimeModel);
      const preparedAgentRuntime = await prepareBridgeAgentTurnRuntime({
        workspace,
        runtimeAgentId,
        nextSessionId,
        traceTurnId,
        text,
        referencedFiles: referencedFileDescriptors,
        activeFile: activeFile ? { path: activeFile.path } : null,
        activeSkills,
        selectedAgent: modelSource === "agent" ? selectedAgent : null,
        agentInstructions: buildWorkspaceAgentInteractionInstructions(),
        executionMemorySummary: currentAgentExecutionSummary,
        contextWindow: agentModelContext.contextWindow ?? effectiveAppContextWindow,
        appendVisibleTraceStep,
        patchVisibleTraceTurn,
      });
      conversationContextRef.current = preparedAgentRuntime.nextConversationContext;
      setConversationContext(preparedAgentRuntime.nextConversationContext);

      if (runtimeAgentRequiresModel && !effectiveRuntimeModel) {
        setChatError("请选择要使用的 LLM 和模型");
        return;
      }
      try {
        const agentSessionStatusId = `${runtimeAgentId}/${preparedAgentRuntime.agentPromptPayload.agentRoleId}`;
        const status = await getAgentSessionStatus(
          workspace.path,
          agentSessionStatusId,
        );
        setAgentSessionStatus(status);
        setAgentSessionError("");
      } catch (caught) {
        setAgentSessionError(String(caught));
      }

      await runAgentTurn({
        nextSessionId,
        traceTurnId,
        assistantMessageId,
        nextConversation,
        nextConversationContext: preparedAgentRuntime.nextConversationContext,
        nextMessages,
        agentPromptPayload: preparedAgentRuntime.agentPromptPayload,
      }, {
        workspace,
        activeFile: preparedAgentRuntime.activeFile,
        activeSkills,
        runtimeAgentId,
        appendVisibleTraceStep,
        updateMessage,
        agentRuntime,
        setChatError,
        prepareActiveAgentRun,
        patchVisibleTraceTurn,
        addRunningAgentTask,
        activateAgentTaskId,
        handledAgentDoneTaskIdsRef,
        chatTraceRef,
        effectiveRuntimeModel,
        allowedAgentTools,
        currentSessionTitle,
      });
    } catch (caught) {
      const message = String(caught);
      appendVisibleTraceStep(traceTurnId, {
        type: "error",
        label: "链路异常",
        status: "error",
        content: message,
        metadata: {
          mode: "agent",
        },
      });
      patchVisibleTraceTurn(traceTurnId, {
        status: "error",
      });
      setChatError(message);
      resetActiveAgentTaskState({
        clearQuestion: false,
        clearSession: true,
        resetTrace: true,
      });
      updateMessage(assistantMessageId, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
      appendAgentConversationResult(message, "error", message);
    } finally {
      setIsSending(false);
    }
  };

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
    setAgentQuestionAnswer: setAgentQuestionAnswerDraft,
    setCustomAgentQuestionAnswer: setCustomAgentQuestionAnswerDraft,
    submitAgentQuestionAnswer,
    setShowThinkingProcess,
    setShowToolCallProcess,
    setModelSource,
    setSelectedRuntimeAgentId,
    setSelectedAgentId,
    setSelectedRuntimeModelId,
    toggleAllowedAgentTool,
    toggleSelectedSkillGroup: toggleConversationSkillGroup,
    sendMessage,
    onAbortTask: () => void agentRuntime.abortTask(visibleActiveAgentTaskId),
  });

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
      onBack={() => setWorkspaceView("chat")}
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

  const fileManagePanel = (
    <FileManage
      bind={fileManageRef}
      workspacePath={workspace.path}
      workspaceKey={workspace.id}
      onFilesChange={setFiles}
      onActiveFileChange={setActiveFile}
    />
  );
  const ledgerPanel = (
    <aside className="flex min-w-0 w-[clamp(300px,30vw,460px)] shrink-0 overflow-hidden bg-background/90 text-foreground shadow-[-8px_0_28px_-30px_rgb(15_23_42_/_0.38)] backdrop-blur">
      <ConversationLedger
        bind={conversationLedgerRef}
        workspacePath={workspace.path}
        chatId={currentSessionId}
        runtimeModel={conversationLedgerRuntimeModel}
        agentId={runtimeAgentId}
      />
    </aside>
  );

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
        onToggleContextPanel: () => setIsContextPanelOpen((current) => !current),
      };

  const content = workspaceView === "settings" ? (
    settingsPanel
  ) : workspaceView === "skills" ? (
    skillsPanel
  ) : workspaceView === "knowledge" ? (
    knowledgePanel
  ) : workspaceView === "tavern" ? (
    tavernPanel
  ) : (
    chatPanel
  );

  const contextPanel = isContextPanelOpen && workspaceView === "chat"
    ? (
      <ContextPanelShell
        activeTool={contextPanelTool}
        onChangeTool={setContextPanelTool}
      >
        {contextPanelTool === "ledger" ? ledgerPanel : fileManagePanel}
      </ContextPanelShell>
    )
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
