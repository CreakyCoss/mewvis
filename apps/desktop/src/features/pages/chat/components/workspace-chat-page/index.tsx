import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Folder } from "lucide-react";
import {
  DEFAULT_ALLOWED_RUNTIME_AGENT_TOOLS,
  normalizeAllowedRuntimeAgentTools,
  type RuntimeAgentToolName,
} from "@/ai/runtime-protocol";
import { createAgentRuntime } from "@/ai/agent-runtime/runtime";
import {
  requireRuntimeModelInput,
  resolveRuntimeModelInput,
} from "@/features/pages/settings/llm/store";
import { resolveAppContextWindow } from "@/features/ai/runtime";
import { ConversationLedger } from "@/features/ai/components/conversation-ledger";
import { FileManage, type FileManageHandle } from "@/features/ai/components/file-manage";
import type { WorkspaceFile, WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import {
  ALL_SKILLS_GROUP_ID,
  NO_SKILLS_GROUP_ID,
} from "@/features/pages/skills/constants";
import { useWorkspaceSkills } from "@/features/pages/skills/use-workspace-skills";
import type { Workspace, WorkspaceSection } from "@/features/pages/workspace/types";
import { listWorkspaceFiles } from "@/features/pages/workspace/files-api";
import { saveChatSession } from "../../api";
import type {
  ChatMessage,
  ComposerSubmitInput,
  PendingAgentQuestion,
} from "../../types";
import {
  keepHistoryThroughMessage,
  moveHistoryItem,
  removeHistoryMessageSegment,
} from "./history";
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
  runAgentTurn,
} from "./agent-mode-runner";
import { prepareBridgeAgentTurnRuntime } from "./bridge-agent-turn-runtime";
import { ChatPanel } from "../chat-panel";
import { useChatPanelStoreBridge } from "../chat-panel/store";
import { useAgentRuntimeEvents } from "./use-agent-runtime-events";
import { useModelSettings } from "./use-model-settings";
import {
  type RunningAgentTaskContext,
  useRunningAgentTasks,
} from "./use-running-agent-tasks";
import { useWorkspaceChatSessions } from "./use-workspace-chat-sessions";

type ContextPanelTool = "files" | "ledger";

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

const workspaceAgentInteractionInstructions = [
  "交互规则：",
  "- 当继续执行前缺少必要信息、需要用户选择方向、需要确认方案，或存在多个合理选项时，必须调用 ask_user 工具询问用户，不要只在正文里提问。",
  "- 如果问题是开放式回答，调用 ask_user 时使用 input.type = \"text\"。",
  "- 如果问题有明确候选项，调用 ask_user 时使用 input.type = \"select\"，并提供至少两个 options；可以加入 { value: \"other\", label: \"请输入\" } 让用户自定义。",
  "- 调用 ask_user 后，等待用户回答，再基于回答继续原任务。",
].join("\n");

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

type WorkspaceChatPageProps = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  isWorkspaceOverviewLoading: boolean;
  workspaceOverviewError: string;
  routeSessionId?: string | null;
  isRouteNewSession?: boolean;
  onSessionCreated?: (sessionId: string) => void;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  renderShell: (props: WorkspaceChatShellProps) => ReactNode;
};

export type WorkspaceChatShellProps = {
  dialogs: ReactNode;
  headerProps: {
    isContextPanelOpen: boolean;
    showToggle?: boolean;
    onToggleContextPanel: () => void;
  } | null;
  content: ReactNode;
  contextPanel: ReactNode;
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
  "userUiMessage"
> & {
  assistantUiMessage?: ChatMessage | null;
  nextSessionId: string | null;
};

export const WorkspaceChatPage = ({
  workspace,
  workspaceSections,
  routeSessionId = null,
  isRouteNewSession = false,
  onSessionCreated,
  onOpenWorkspace,
  onCreateWorkspace,
  renderShell,
}: WorkspaceChatPageProps) => {
  const agentRuntime = useMemo(() => createAgentRuntime(), []);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const activeAgentTaskIdRef = useRef("");
  const activeAgentMessageIdRef = useRef("");
  const lastAgentErrorRef = useRef("");
  const lastAgentStderrRef = useRef("");
  const handledAgentDoneTaskIdsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<ChatMessage[]>([]);
  const fileManageRef = useRef<FileManageHandle>(null);
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
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [chatError, setChatError] = useState("");
  const [allowedAgentTools, setAllowedAgentTools] = useState<RuntimeAgentToolName[]>(() => [
    ...DEFAULT_ALLOWED_RUNTIME_AGENT_TOOLS,
  ]);
  const [selectedSkillGroupIds, setSelectedSkillGroupIds] = useState<string[]>([
    ALL_SKILLS_GROUP_ID,
  ]);
  const skillGroupSelectionTouchedRef = useRef(false);
  const skillGroupWorkspaceRef = useRef(workspace.id);
  const [contextPanelTool, setContextPanelTool] =
    useState<ContextPanelTool>("files");
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeAgentTaskId, setActiveAgentTaskId] = useState("");
  const [pendingAgentQuestion, setPendingAgentQuestion] = useState<PendingAgentQuestion | null>(null);
  const [agentQuestionAnswer, setAgentQuestionAnswer] = useState("");
  const [customAgentQuestionAnswer, setCustomAgentQuestionAnswer] = useState("");
  const [isAnsweringAgentQuestion, setIsAnsweringAgentQuestion] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState(DEFAULT_SESSION_TITLE);
  const workspaceOptions = useMemo(
    () => workspaceSections.flatMap((section) => section.workspaces),
    [workspaceSections],
  );
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
  } = useModelSettings({
    agentRuntime,
  });
  const effectiveAppContextWindow = useMemo(() => {
    const modelInput = effectiveRuntimeModel
      ? resolveRuntimeModelInput(effectiveRuntimeModel.id)
      : null;
    return resolveAppContextWindow(modelInput);
  }, [effectiveRuntimeModel]);
  const {
    skills,
    skillGroups,
    skillsError,
    defaultSkillGroupId,
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
    addRunningAgentTask,
    removeRunningAgentTask,
  } = useRunningAgentTasks({
    workspacePath: workspace.path,
    currentSessionId,
    activeAgentTaskId,
  });

  const closeContextPanels = useCallback(() => {
    setIsContextPanelOpen(false);
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
      clearTerminalState?: boolean;
    } = {},
  ) => {
    const {
      clearQuestion = true,
      clearTerminalState = false,
    } = options;

    activeAgentTaskIdRef.current = "";
    activeAgentMessageIdRef.current = "";
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
    if (restoreTerminalState) {
      lastAgentErrorRef.current = task.lastError;
      lastAgentStderrRef.current = task.lastStderr;
    }
    applyAgentQuestionDraft(
      task.pendingQuestion,
      task.questionAnswer,
      task.customQuestionAnswer,
    );
    setActiveAgentTaskId(task.taskId);
  }, [applyAgentQuestionDraft]);

  const prepareActiveAgentRun = useCallback(({
    messageId,
  }: {
    messageId: string;
  }) => {
    activeAgentMessageIdRef.current = messageId;
    lastAgentErrorRef.current = "";
    lastAgentStderrRef.current = "";
  }, []);
  const restoreRunningAgentTaskView = useCallback((task: RunningAgentTaskContext) => {
    if (!task.messages.some((message) => message.id === task.messageId)) {
      return false;
    }

    messagesRef.current = task.messages;
    setMessages(task.messages);
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
    sessionsError,
    setSessionsError,
  } = useWorkspaceChatSessions({
    workspace,
    route: {
      sessionId: routeSessionId,
      isNewSession: isRouteNewSession,
      onSessionCreated,
    },
    navigation: {
      closePanels: closeContextPanels,
    },
    ui: {
      setComposerResetKey,
      clearAgentQuestionDraft,
    },
    chat: {
      currentSessionId,
      setCurrentSessionId,
      currentSessionTitle,
      setCurrentSessionTitle,
      currentSessionIdRef,
      currentSessionTitleRef,
      messages,
      setMessages,
      messagesRef,
    },
    agentTasks: {
      runningAgentTasksRef,
      detachActiveAgentTask,
      applyActiveAgentTaskState,
    },
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

  useEffect(() => {
    resetConversationSkillGroup();
  }, [
    isRouteNewSession,
    resetConversationSkillGroup,
    routeSessionId,
    workspace.id,
  ]);

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

  const persistRunningAgentTask = useCallback(async (task: RunningAgentTaskContext) => {
    const title = deriveSessionTitle(task.messages);
    const isUnread =
      task.workspacePath !== workspace.path ||
      task.sessionId !== currentSessionIdRef.current;
    task.title = title;
    await saveChatSession({
      workspacePath: task.workspacePath,
      sessionId: task.sessionId,
      title,
      messages: task.messages,
      isUnread,
    });
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
    lastAgentErrorRef,
    lastAgentStderrRef,
    handledAgentDoneTaskIdsRef,
    runningAgentTasksRef,
    messagesRef,
    updateMessage,
    persistRunningAgentTask,
    removeRunningAgentTask,
    applyAgentQuestionDraft,
    clearPendingAgentQuestion,
    restoreRunningAgentTaskView,
    resetActiveAgentTaskState,
    setChatError,
    loadFiles: refreshFileSurfaces,
  });

  const applyHistoryChange = useCallback((
    nextMessages: ChatMessage[],
  ) => {
    if (visibleActiveAgentTaskId) {
      setSessionsError("Agent 正在处理，结束后再修改历史记录");
      return false;
    }

    setSessionsError("");
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
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
  }, [applyHistoryChange]);

  const deleteHistoryMessage = useCallback((messageId: string) => {
    const currentMessages = messagesRef.current;
    const deletedIndex = currentMessages.findIndex((message) => message.id === messageId);
    const deletedMessage = deletedIndex >= 0 ? currentMessages[deletedIndex] : null;
    if (!deletedMessage) {
      return;
    }
    const nextMessages = removeHistoryMessageSegment(currentMessages, messageId);

    applyHistoryChange(nextMessages);
  }, [applyHistoryChange]);

  const moveHistoryMessage = useCallback((
    messageId: string,
    direction: "up" | "down",
  ) => {
    const nextMessages = moveHistoryItem(messagesRef.current, messageId, direction);
    if (!applyHistoryChange(nextMessages)) {
      return;
    }
  }, [applyHistoryChange]);
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
    userUiMessage,
    assistantUiMessage,
  }: CommitChatTurnDraftInput) => {
    if (nextSessionId && nextSessionId !== currentSessionId) {
      currentSessionIdRef.current = nextSessionId;
      setCurrentSessionId(nextSessionId);
    }

    const nextMessages = assistantUiMessage
      ? [...messagesRef.current, userUiMessage, assistantUiMessage]
      : [...messagesRef.current, userUiMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
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
    const {
      userUiMessage,
      assistantUiMessage,
    } = createChatTurnDraft({
      now,
      text,
      referencedFiles: draftReferencedFiles,
      assistantAgentAvatar: modelSource === "agent" ? selectedAgent?.avatar : undefined,
      assistantAgentName: modelSource === "agent" ? selectedAgent?.name : undefined,
      userMessageId,
      assistantMessageId,
    });
    const nextSessionId = currentSessionId ?? createChatSessionId();
    const nextMessages = commitChatTurnDraft({
      nextSessionId,
      userUiMessage,
      assistantUiMessage,
    });

    try {
      const preparedAgentRuntime = await prepareBridgeAgentTurnRuntime({
        workspace,
        nextSessionId,
        text,
        referencedFiles: referencedFileDescriptors,
        activeFile: activeFile ? { path: activeFile.path } : null,
        activeSkills,
        selectedAgent: modelSource === "agent" ? selectedAgent : null,
        agentInstructions: workspaceAgentInteractionInstructions,
        executionMemorySummary: "",
      });

      if (runtimeAgentRequiresModel && !effectiveRuntimeModel) {
        setChatError("请选择要使用的 LLM 和模型");
        return;
      }

      await runAgentTurn({
        nextSessionId,
        assistantMessageId,
        nextMessages,
        agentPromptPayload: preparedAgentRuntime.agentPromptPayload,
      }, {
        workspace,
        activeSkills,
        runtimeAgentId,
        updateMessage,
        agentRuntime,
        setChatError,
        prepareActiveAgentRun,
        addRunningAgentTask,
        activateAgentTaskId,
        handledAgentDoneTaskIdsRef,
        effectiveRuntimeModel,
        allowedAgentTools,
        currentSessionTitle,
      });
    } catch (caught) {
      const message = String(caught);
      setChatError(message);
      resetActiveAgentTaskState({
        clearQuestion: false,
      });
      updateMessage(assistantMessageId, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
    } finally {
      setIsSending(false);
    }
  };

  useChatPanelStoreBridge({
    chatScrollAreaRef,
    workspace,
    workspaces: workspaceOptions,
    messages,
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
    onEditHistoryMessage: editHistoryMessage,
    onDeleteHistoryMessage: deleteHistoryMessage,
    onMoveHistoryMessage: moveHistoryMessage,
    onOpenWorkspace,
    onCreateWorkspace,
    setAgentQuestionAnswer: setAgentQuestionAnswerDraft,
    setCustomAgentQuestionAnswer: setCustomAgentQuestionAnswerDraft,
    submitAgentQuestionAnswer,
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
        workspacePath={workspace.path}
        chatId={currentSessionId}
        runtimeModel={conversationLedgerRuntimeModel}
        agentId={runtimeAgentId}
      />
    </aside>
  );

  const headerProps = {
    isContextPanelOpen,
    showToggle: true,
    onToggleContextPanel: () => setIsContextPanelOpen((current) => !current),
  };

  const contextPanel = isContextPanelOpen
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
    dialogs: null,
    headerProps,
    content: chatPanel,
    contextPanel,
  });
};
