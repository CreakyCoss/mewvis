import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Folder, PanelRight } from "lucide-react";
import { toast } from "sonner";
import type { AgentToolSummary } from "@/agent-client/types";
import { createAgentClient } from "@/agent-client/runtime";
import { ConversationLedger } from "@/features/ai/components/conversation-ledger";
import { FileManage, type FileManageHandle } from "@/features/ai/components/file-manage";
import type { WorkspaceFile, WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import { ALL_SKILLS_GROUP_ID, NO_SKILLS_GROUP_ID } from "@/features/pages/skills/constants";
import { useWorkspaceSkills } from "@/features/pages/skills/use-workspace-skills";
import type { Workspace, WorkspaceSection } from "@/features/pages/workspace/types";
import { listWorkspaceFiles } from "@/features/pages/workspace/files-api";
import { submitStoryManuscript } from "@/features/pages/stories/manuscripts/service";
import { saveChatSession } from "../../api";
import type { ChatMessage, ComposerSubmitInput, PendingAgentQuestion } from "../../types";
import { useChatSessionsStore } from "../../session-store";
import { keepHistoryThroughMessage, moveHistoryItem, removeHistoryMessageSegment } from "./history";
import { type ChatTurnDraft, createChatTurnDraft, validateComposerSubmit } from "./chat-turn";
import { createChatSessionId, createMessageId, DEFAULT_SESSION_TITLE, deriveSessionTitle } from "../../utils/sessions";
import { ChatLayout } from "../../layout";
import { runAgentTurn } from "./agent-mode-runner";
import { prepareAgentTurnRuntime } from "./agent-turn-runtime";
import { ChatPanel } from "../chat-panel";
import { useChatPanelStoreBridge } from "../chat-panel/store";
import { useAgentClientEvents } from "./use-agent-client-events";
import { useModelSettings } from "./use-model-settings";
import { type RunningAgentTaskContext, useRunningAgentTasks } from "./use-running-agent-tasks";
import { useWorkspaceChatSessions } from "./use-workspace-chat-sessions";
import type { StoryChatSeed } from "./story-seed";

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
  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

const contextPanelToggleButtonClass =
  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:hover:bg-primary/15";

const workspaceAgentInteractionInstructions = [
  "交互规则：",
  "- 当继续执行前缺少必要信息、需要用户选择方向、需要确认方案，或存在多个合理选项时，必须调用 ask_user 工具询问用户，不要只在正文里提问。",
  '- 如果问题是开放式回答，调用 ask_user 时使用 input.type = "text"。',
  '- 如果问题有明确候选项，调用 ask_user 时使用 input.type = "select"，并提供至少两个 options；可以加入 { value: "other", label: "请输入" } 让用户自定义。',
  "- 调用 ask_user 后，等待用户回答，再基于回答继续原任务。",
].join("\n");

type WorkspaceChatPageProps = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  routeSessionId?: string | null;
  isRouteNewSession?: boolean;
  onSessionCreated?: (sessionId: string) => void;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  storyChatSeed?: StoryChatSeed | null;
};

const resolveStringStateAction = (action: SetStateAction<string>, previous: string) =>
  typeof action === "function" ? action(previous) : action;

const specialSkillGroupIds = new Set([ALL_SKILLS_GROUP_ID, NO_SKILLS_GROUP_ID]);

const defaultSkillGroupSelection = (defaultSkillGroupId: string) => [defaultSkillGroupId || ALL_SKILLS_GROUP_ID];

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

const toggleSkillGroupSelection = (current: string[], skillGroupId: string, checked: boolean) => {
  if (checked) {
    if (specialSkillGroupIds.has(skillGroupId)) {
      return [skillGroupId];
    }
    return normalizeSkillGroupSelection([...current.filter((id) => !specialSkillGroupIds.has(id)), skillGroupId]);
  }

  const next = current.filter((id) => id !== skillGroupId);
  return normalizeSkillGroupSelection(next);
};

const getMessageTextForStorySubmission = (message: ChatMessage) => {
  const blockText = message.agentBlocks
    ?.flatMap((block) => (block.type === "text" ? [block.content] : []))
    .join("\n\n")
    .trim();

  return message.text.trim() || blockText || "";
};

const createStorySubmissionTitle = (message: ChatMessage, fallbackTitle: string) => {
  const text = getMessageTextForStorySubmission(message).replace(/\s+/g, " ").trim();
  const prefix = message.role === "user" ? "用户稿件" : "助手稿件";
  return text ? `${prefix}：${text.slice(0, 28)}` : fallbackTitle;
};

type CommitChatTurnDraftInput = Pick<ChatTurnDraft, "userUiMessage"> & {
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
  storyChatSeed = null,
}: WorkspaceChatPageProps) => {
  const agentClient = useMemo(() => createAgentClient(), []);
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
  const [agentTools, setAgentTools] = useState<AgentToolSummary[]>([]);
  const [allowedAgentTools, setAllowedAgentTools] = useState<string[]>([]);
  const [selectedSkillGroupIds, setSelectedSkillGroupIds] = useState<string[]>([ALL_SKILLS_GROUP_ID]);
  const skillGroupSelectionTouchedRef = useRef(false);
  const skillGroupWorkspaceRef = useRef(workspace.id);
  const [contextPanelTool, setContextPanelTool] = useState<ContextPanelTool>("files");
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
  const [storySubmittingMessageIds, setStorySubmittingMessageIds] = useState<string[]>([]);
  const upsertSession = useChatSessionsStore((store) => store.upsertSession);
  const upsertSessionMeta = useChatSessionsStore((store) => store.upsertSessionMeta);
  const setSessionRunning = useChatSessionsStore((store) => store.setSessionRunning);
  const workspaceOptions = useMemo(
    () => workspaceSections.flatMap((section) => section.workspaces),
    [workspaceSections],
  );
  const {
    runtimeModels,
    selectedRuntimeModelId,
    setSelectedRuntimeModelId,
    setSelectedAgentId,
    settingsError,
    isSettingsLoading,
    selectedRuntimeModel,
    runtimeAgentRequiresModel,
    agentProfiles,
    selectedAgent,
    effectiveRuntimeModel,
  } = useModelSettings({
    agentClient,
  });
  const { skills, skillGroups, skillsError, defaultSkillGroupId } = useWorkspaceSkills({
    workspaceId: workspace.id,
  });
  useEffect(() => {
    let cancelled = false;
    agentClient.capabilities
      .listAgentTools()
      .then((result) => {
        if (cancelled) return;

        const availableToolNames = new Set(result.tools.map((tool) => tool.name));
        setAgentTools([...result.tools]);
        setAllowedAgentTools((current) => {
          const next = current.filter((toolName) => availableToolNames.has(toolName));
          if (next.length > 0) {
            return [...new Set(next)];
          }
          return result.defaultToolNames.filter((toolName) => availableToolNames.has(toolName));
        });
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to load agent runtime tools", error);
          setAgentTools([]);
          setAllowedAgentTools([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentClient]);
  const availableSkillGroupIds = useMemo(() => new Set(skillGroups.map((group) => group.id)), [skillGroups]);
  const resolvedDefaultSkillGroupIds = useMemo(() => {
    const defaultSelection = defaultSkillGroupSelection(defaultSkillGroupId);
    const [defaultId] = defaultSelection;
    return specialSkillGroupIds.has(defaultId) || availableSkillGroupIds.has(defaultId)
      ? defaultSelection
      : [ALL_SKILLS_GROUP_ID];
  }, [availableSkillGroupIds, defaultSkillGroupId]);
  const selectedSkillGroups = useMemo(
    () =>
      selectedSkillGroupIds
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
  const storyRuntimeContextSections = useMemo(
    () => (storyChatSeed ? [storyChatSeed.runtimeInstruction] : []),
    [storyChatSeed],
  );
  const newSessionSeed = useMemo(
    () =>
      storyChatSeed
        ? {
            id: null,
            title: storyChatSeed.title,
            messages: storyChatSeed.messages,
          }
        : null,
    [storyChatSeed],
  );
  const activeSkills = useMemo(() => {
    if (selectedSkillGroupIds.includes(NO_SKILLS_GROUP_ID)) {
      return [];
    }
    if (selectedSkillGroupIds.includes(ALL_SKILLS_GROUP_ID)) {
      return skills;
    }
    const skillKeys = new Set(
      selectedSkillGroups.flatMap((group) =>
        group.skills.filter((skill) => skill.disabled !== true).map((skill) => skill.key),
      ),
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
    const validSkillGroupIds = selectedSkillGroupIds.filter(
      (id) => specialSkillGroupIds.has(id) || availableSkillGroupIds.has(id),
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
  }, [availableSkillGroupIds, resolvedDefaultSkillGroupIds, selectedSkillGroupIds]);
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

  const { runningAgentTasksRef, visibleActiveAgentTaskId, addRunningAgentTask, removeRunningAgentTask } =
    useRunningAgentTasks({
      workspacePath: workspace.path,
      currentSessionId,
      activeAgentTaskId,
    });

  const closeContextPanels = useCallback(() => {
    setIsContextPanelOpen(false);
  }, []);

  const updateMessage = useCallback((messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => {
      const next = current.map((message) => (message.id === messageId ? updater(message) : message));
      messagesRef.current = next;
      return next;
    });
  }, []);

  const applyAgentQuestionDraft = useCallback(
    (question: PendingAgentQuestion | null, answer = "", customAnswer = "") => {
      pendingAgentQuestionRef.current = question;
      agentQuestionAnswerRef.current = answer;
      customAgentQuestionAnswerRef.current = customAnswer;
      setPendingAgentQuestion(question);
      setAgentQuestionAnswer(answer);
      setCustomAgentQuestionAnswer(customAnswer);
    },
    [],
  );

  const updateCurrentAgentQuestionTaskDraft = useCallback(
    (patch: Partial<Pick<RunningAgentTaskContext, "questionAnswer" | "customQuestionAnswer">>) => {
      const question = pendingAgentQuestionRef.current;
      if (!question) {
        return;
      }

      const task = runningAgentTasksRef.current.get(question.taskId);
      if (task?.pendingQuestion?.questionId !== question.questionId) {
        return;
      }

      Object.assign(task, patch);
    },
    [],
  );

  const setAgentQuestionAnswerDraft = useCallback<Dispatch<SetStateAction<string>>>(
    (action) => {
      const nextAnswer = resolveStringStateAction(action, agentQuestionAnswerRef.current);
      agentQuestionAnswerRef.current = nextAnswer;
      setAgentQuestionAnswer(nextAnswer);
      updateCurrentAgentQuestionTaskDraft({ questionAnswer: nextAnswer });
    },
    [updateCurrentAgentQuestionTaskDraft],
  );

  const setCustomAgentQuestionAnswerDraft = useCallback<Dispatch<SetStateAction<string>>>(
    (action) => {
      const nextAnswer = resolveStringStateAction(action, customAgentQuestionAnswerRef.current);
      customAgentQuestionAnswerRef.current = nextAnswer;
      setCustomAgentQuestionAnswer(nextAnswer);
      updateCurrentAgentQuestionTaskDraft({ customQuestionAnswer: nextAnswer });
    },
    [updateCurrentAgentQuestionTaskDraft],
  );

  const clearAgentQuestionDraft = useCallback(() => {
    applyAgentQuestionDraft(null);
  }, [applyAgentQuestionDraft]);

  const activateAgentTaskId = useCallback((taskId: string) => {
    activeAgentTaskIdRef.current = taskId;
    setActiveAgentTaskId(taskId);
  }, []);

  const resetActiveAgentTaskState = useCallback(
    (
      options: {
        clearQuestion?: boolean;
        clearTerminalState?: boolean;
      } = {},
    ) => {
      const { clearQuestion = true, clearTerminalState = false } = options;

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
    },
    [clearAgentQuestionDraft],
  );

  const applyActiveAgentTaskState = useCallback(
    (task: RunningAgentTaskContext, options: { restoreTerminalState?: boolean } = {}) => {
      const { restoreTerminalState = true } = options;

      activeAgentTaskIdRef.current = task.taskId;
      activeAgentMessageIdRef.current = task.messageId;
      if (restoreTerminalState) {
        lastAgentErrorRef.current = task.lastError;
        lastAgentStderrRef.current = task.lastStderr;
      }
      applyAgentQuestionDraft(task.pendingQuestion, task.questionAnswer, task.customQuestionAnswer);
      setActiveAgentTaskId(task.taskId);
    },
    [applyAgentQuestionDraft],
  );

  const prepareActiveAgentRun = useCallback(({ messageId }: { messageId: string }) => {
    activeAgentMessageIdRef.current = messageId;
    lastAgentErrorRef.current = "";
    lastAgentStderrRef.current = "";
  }, []);
  const restoreRunningAgentTaskView = useCallback(
    (task: RunningAgentTaskContext) => {
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
    },
    [applyActiveAgentTaskState],
  );

  const detachActiveAgentTask = useCallback(() => {
    const currentTaskId = activeAgentTaskIdRef.current;
    const currentTask = currentTaskId ? runningAgentTasksRef.current.get(currentTaskId) : null;
    if (
      currentTask &&
      currentTask.workspacePath === workspace.path &&
      currentTask.sessionId === currentSessionIdRef.current &&
      messagesRef.current.some((message) => message.id === currentTask.messageId)
    ) {
      currentTask.title = currentSessionTitleRef.current;
      currentTask.messages = messagesRef.current;
      currentTask.pendingQuestion =
        pendingAgentQuestionRef.current?.taskId === currentTaskId ? pendingAgentQuestionRef.current : null;
      currentTask.questionAnswer = agentQuestionAnswerRef.current;
      currentTask.customQuestionAnswer = customAgentQuestionAnswerRef.current;
    }

    resetActiveAgentTaskState({ clearTerminalState: true });
  }, [resetActiveAgentTaskState, workspace.path]);

  const getChatScrollViewport = useCallback(
    () => chatScrollAreaRef.current?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']") ?? null,
    [],
  );

  const scrollChatToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
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
    },
    [getChatScrollViewport],
  );

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
  }, [getChatScrollViewport, messages.length, pendingAgentQuestion, scrollActiveThinkingToBottom]);

  const toggleAllowedAgentTool = useCallback((toolId: string, enabled: boolean) => {
    setAllowedAgentTools((current) => {
      if (enabled) {
        return current.includes(toolId) ? current : [...new Set([...current, toolId])];
      }

      return current.filter((item) => item !== toolId);
    });
  }, []);

  const { sessionsError, setSessionsError } = useWorkspaceChatSessions({
    workspace,
    route: {
      sessionId: routeSessionId,
      isNewSession: isRouteNewSession,
      onSessionCreated,
      newSessionSeed: isRouteNewSession ? newSessionSeed : null,
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
    setSelectedSkillGroupIds((current) => toggleSkillGroupSelection(current, skillGroupId, checked));
  }, []);

  useEffect(() => {
    resetConversationSkillGroup();
  }, [isRouteNewSession, resetConversationSkillGroup, routeSessionId, workspace.id]);

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
    const hasNewPendingQuestion = nextScrollSnapshot.pendingQuestionId !== previousScrollSnapshot.pendingQuestionId;
    const shouldAnimateScroll = hasNewMessage || hasNewPendingQuestion;

    chatScrollSnapshotRef.current = nextScrollSnapshot;
    scrollActiveThinkingToBottom();
    scrollChatToBottom(shouldAnimateScroll && messages.length > 2 ? "smooth" : "auto");
  }, [messages, pendingAgentQuestion, scrollActiveThinkingToBottom, scrollChatToBottom]);

  const persistRunningAgentTask = useCallback(
    async (task: RunningAgentTaskContext) => {
      const title = deriveSessionTitle(task.messages);
      const isUnread = task.workspacePath !== workspace.path || task.sessionId !== currentSessionIdRef.current;
      task.title = title;
      const session = await saveChatSession({
        workspacePath: task.workspacePath,
        sessionId: task.sessionId,
        title,
        messages: task.messages,
        isUnread,
      });
      const taskWorkspace = workspaceOptions.find((item) => item.path === task.workspacePath);
      if (taskWorkspace) {
        upsertSession(taskWorkspace.id, session);
      }
    },
    [upsertSession, workspace.path, workspaceOptions],
  );

  const clearPendingAgentQuestion = useCallback(
    (questionId: string) => {
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
    },
    [clearAgentQuestionDraft],
  );

  useAgentClientEvents({
    agentClient,
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

  const applyHistoryChange = useCallback(
    (nextMessages: ChatMessage[]) => {
      if (visibleActiveAgentTaskId) {
        setSessionsError("Agent 正在处理，结束后再修改历史记录");
        return false;
      }

      setSessionsError("");
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      return true;
    },
    [visibleActiveAgentTaskId],
  );

  const editHistoryMessage = useCallback(
    (messageId: string, nextText: string) => {
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
      const nextMessages = editedMessage ? keepHistoryThroughMessage(editedMessages, messageId) : editedMessages;

      if (!applyHistoryChange(nextMessages)) {
        return;
      }
    },
    [applyHistoryChange],
  );

  const deleteHistoryMessage = useCallback(
    (messageId: string) => {
      const currentMessages = messagesRef.current;
      const deletedIndex = currentMessages.findIndex((message) => message.id === messageId);
      const deletedMessage = deletedIndex >= 0 ? currentMessages[deletedIndex] : null;
      if (!deletedMessage) {
        return;
      }
      const nextMessages = removeHistoryMessageSegment(currentMessages, messageId);

      applyHistoryChange(nextMessages);
    },
    [applyHistoryChange],
  );

  const moveHistoryMessage = useCallback(
    (messageId: string, direction: "up" | "down") => {
      const nextMessages = moveHistoryItem(messagesRef.current, messageId, direction);
      if (!applyHistoryChange(nextMessages)) {
        return;
      }
    },
    [applyHistoryChange],
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
      await agentClient.tasks.answerQuestion({
        taskId: pendingAgentQuestion.taskId,
        questionId: answeredQuestionId,
        answer,
      });
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

  const commitChatTurnDraft = ({ nextSessionId, userUiMessage, assistantUiMessage }: CommitChatTurnDraftInput) => {
    if (nextSessionId && nextSessionId !== currentSessionId) {
      currentSessionIdRef.current = nextSessionId;
      setCurrentSessionId(nextSessionId);
    }

    const nextMessages = assistantUiMessage
      ? [...messagesRef.current, userUiMessage, assistantUiMessage]
      : [...messagesRef.current, userUiMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    if (nextSessionId) {
      upsertSessionMeta(workspace.id, {
        id: nextSessionId,
        title: deriveSessionTitle(nextMessages),
        path: "",
        createdAt: userUiMessage.createdAt,
        updatedAt: Date.now(),
        messageCount: nextMessages.length,
        isUnread: false,
      });
    }
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
    const { userUiMessage, assistantUiMessage } = createChatTurnDraft({
      now,
      text,
      referencedFiles: draftReferencedFiles,
      assistantAgentAvatar: selectedAgent?.avatar,
      assistantAgentName: selectedAgent?.name,
      userMessageId,
      assistantMessageId,
    });
    const nextSessionId = currentSessionId ?? createChatSessionId();
    const nextMessages = commitChatTurnDraft({
      nextSessionId,
      userUiMessage,
      assistantUiMessage,
    });
    let didStartAgentTask = false;
    setSessionRunning(workspace.path, nextSessionId, true);

    try {
      const preparedAgentTurn = await prepareAgentTurnRuntime({
        workspace,
        nextSessionId,
        text,
        referencedFiles: referencedFileDescriptors,
        activeFile: activeFile ? { path: activeFile.path } : null,
        activeSkills,
        selectedAgent,
        agentInstructions: workspaceAgentInteractionInstructions,
        runtimeContextSections: storyRuntimeContextSections,
        executionMemorySummary: "",
      });

      if (runtimeAgentRequiresModel && !effectiveRuntimeModel) {
        setChatError("请选择要使用的 LLM 和模型");
        setSessionRunning(workspace.path, nextSessionId, false);
        return;
      }

      await runAgentTurn(
        {
          nextSessionId,
          assistantMessageId,
          nextMessages,
          agentPromptPayload: preparedAgentTurn.agentPromptPayload,
        },
        {
          workspace,
          activeSkills,
          updateMessage,
          agentClient,
          setChatError,
          prepareActiveAgentRun,
          addRunningAgentTask: (task) => {
            didStartAgentTask = true;
            addRunningAgentTask(task);
          },
          activateAgentTaskId,
          handledAgentDoneTaskIdsRef,
          effectiveRuntimeModel,
          allowedAgentTools,
          currentSessionTitle,
        },
      );
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
      if (!didStartAgentTask) {
        setSessionRunning(workspace.path, nextSessionId, false);
      }
    } finally {
      setIsSending(false);
    }
  };

  const submitMessageToStory = useCallback(
    async (message: ChatMessage) => {
      if (!storyChatSeed) {
        return;
      }

      if (storyChatSeed.messages.some((seedMessage) => seedMessage.id === message.id)) {
        setChatError("引导消息不需要收稿。");
        return;
      }

      const content = getMessageTextForStorySubmission(message);
      if (!content) {
        setChatError("没有可收稿的消息内容。");
        return;
      }

      setStorySubmittingMessageIds((current) => (current.includes(message.id) ? current : [...current, message.id]));
      try {
        await submitStoryManuscript(storyChatSeed.storyId, {
          storyId: storyChatSeed.storyId,
          nodeId: storyChatSeed.nodeId,
          source: "chat",
          sourceRunId: currentSessionId ?? undefined,
          sourceMessageIds: [message.id],
          title: createStorySubmissionTitle(message, storyChatSeed.title),
          content,
          summary: content.replace(/\s+/g, " ").trim().slice(0, 160),
          metadata: {
            channel: "workspace-chat",
            role: message.role,
            sessionId: currentSessionId,
          },
        });
        setChatError("");
        toast.success("已发送到故事收稿箱。");
      } catch (error) {
        console.error("Failed to submit chat message to story", error);
        const messageText = error instanceof Error ? error.message : "收稿失败。";
        setChatError(`收稿失败：${messageText}`);
        toast.error("收稿失败。");
      } finally {
        setStorySubmittingMessageIds((current) => current.filter((id) => id !== message.id));
      }
    },
    [currentSessionId, storyChatSeed],
  );

  useChatPanelStoreBridge({
    chatScrollAreaRef,
    workspace,
    workspaces: workspaceOptions,
    messages,
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
    agentProfiles,
    runtimeModels,
    selectedRuntimeModelId,
    selectedRuntimeModel,
    agentTools,
    allowedAgentTools,
    skillGroups,
    defaultSkillGroupId,
    selectedSkillGroupIds,
    selectedSkillGroupLabel,
    onEditHistoryMessage: editHistoryMessage,
    onDeleteHistoryMessage: deleteHistoryMessage,
    onMoveHistoryMessage: moveHistoryMessage,
    onSubmitMessageToStory: storyChatSeed ? submitMessageToStory : null,
    storySubmittingMessageIds,
    onOpenWorkspace,
    onCreateWorkspace,
    setAgentQuestionAnswer: setAgentQuestionAnswerDraft,
    setCustomAgentQuestionAnswer: setCustomAgentQuestionAnswerDraft,
    submitAgentQuestionAnswer,
    setSelectedAgentId,
    setSelectedRuntimeModelId,
    toggleAllowedAgentTool,
    toggleSelectedSkillGroup: toggleConversationSkillGroup,
    sendMessage,
    onAbortTask: () => void agentClient.tasks.abort(visibleActiveAgentTaskId),
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
    <aside className="flex min-w-0 w-[clamp(240px,20vw,340px)] shrink-0 overflow-hidden bg-background/90 text-foreground shadow-[-8px_0_28px_-30px_rgb(15_23_42_/_0.38)] backdrop-blur">
      <ConversationLedger workspacePath={workspace.path} chatId={currentSessionId} />
    </aside>
  );

  const contextPanel = isContextPanelOpen ? (contextPanelTool === "ledger" ? ledgerPanel : fileManagePanel) : null;
  const contextRail = (
    <nav
      className="flex w-10 shrink-0 flex-col items-center gap-1.5 border-l border-border/60 bg-muted/35 px-1 py-2.5"
      aria-label="右侧工具"
    >
      <button
        type="button"
        className={contextPanelToggleButtonClass}
        title={isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
        aria-label={isContextPanelOpen ? "收起右侧面板" : "展开右侧面板"}
        aria-pressed={isContextPanelOpen}
        data-active={isContextPanelOpen}
        onClick={() => setIsContextPanelOpen((current) => !current)}
      >
        <PanelRight className="size-4" />
      </button>
      <div className="h-px w-5 bg-border/70" />
      {contextPanelTools.map((tool) => {
        const Icon = tool.icon;
        const isActiveTool = isContextPanelOpen && contextPanelTool === tool.value;

        return (
          <button
            key={tool.value}
            type="button"
            className={contextPanelToolButtonClass}
            title={tool.label}
            aria-label={`显示${tool.label}`}
            aria-pressed={isActiveTool}
            data-active={isActiveTool}
            onClick={() => {
              setContextPanelTool(tool.value);
              setIsContextPanelOpen(true);
            }}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </nav>
  );

  return <ChatLayout content={chatPanel} contextPanel={contextPanel} contextRail={contextRail} />;
};
