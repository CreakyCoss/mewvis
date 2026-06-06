import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  normalizeChatContextSummary,
  normalizeConversationMessages,
} from "@/ai/agent-context";
import type { Workspace, WorkspaceSection } from "@/features/workspaces/types";
import {
  deleteChatSession,
  listChatSessions,
  loadChatSession,
  saveChatSession,
  setChatSessionUnread,
} from "../../api";
import type {
  AgentSessionStatus,
  ChatContextSummary,
  ChatMessage,
  ChatSessionMeta,
  ChatTraceTurn,
  ConversationMessage,
} from "../../types";
import type {
  ContextDebugSnapshot,
  PendingAgentQuestion,
} from "../../page-types";
import {
  rebuildConversationFromVisibleMessages,
  sortChatSessionsByFixedOrder,
  toHydratableSession,
  upsertChatSessionMeta,
  type HydratableChatSession,
} from "./history";
import type { RunningAgentTaskContext } from "./agent-task";
import { DEFAULT_SESSION_TITLE, deriveSessionTitle } from "../../utils/sessions";
import { useSidebarSessions } from "./use-sidebar-sessions";
import { getContextEngine } from "@/ai/agent-context";

type UseWorkspaceChatSessionsInput = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  onOpenWorkspace: (workspace: Workspace) => void;
  closeSettingsAndContextPanels: () => void;
  setIsContextPanelOpen: Dispatch<SetStateAction<boolean>>;
  setComposerResetKey: Dispatch<SetStateAction<number>>;
  currentSessionId: string | null;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  currentSessionTitle: string;
  setCurrentSessionTitle: Dispatch<SetStateAction<string>>;
  currentSessionIdRef: MutableRefObject<string | null>;
  currentSessionTitleRef: MutableRefObject<string>;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  conversation: ConversationMessage[];
  setConversation: Dispatch<SetStateAction<ConversationMessage[]>>;
  conversationRef: MutableRefObject<ConversationMessage[]>;
  conversationContext: ChatContextSummary | null;
  setConversationContext: Dispatch<SetStateAction<ChatContextSummary | null>>;
  conversationContextRef: MutableRefObject<ChatContextSummary | null>;
  chatTrace: ChatTraceTurn[];
  replaceChatTrace: (nextTrace: ChatTraceTurn[]) => void;
  setContextDebugSnapshot: Dispatch<SetStateAction<ContextDebugSnapshot | null>>;
  setContextEngineId: Dispatch<SetStateAction<string>>;
  preferredContextEngineIdRef: MutableRefObject<string>;
  setAgentRuntimeSessionId: Dispatch<SetStateAction<string | null>>;
  setAgentSessionStatus: Dispatch<SetStateAction<AgentSessionStatus | null>>;
  setAgentSessionError: Dispatch<SetStateAction<string>>;
  runningAgentTasksRef: MutableRefObject<Map<string, RunningAgentTaskContext>>;
  detachActiveAgentTask: () => void;
  applyActiveAgentTaskState: (
    task: RunningAgentTaskContext,
    options?: { restoreTerminalState?: boolean },
  ) => void;
  clearExpandedAgentBlocks: () => void;
  clearAgentQuestionDraft: () => void;
  isAgentTaskRunningForSession: (targetWorkspacePath: string, sessionId: string) => boolean;
  pendingAgentQuestion: PendingAgentQuestion | null;
  visibleActiveAgentTaskId: string;
  agentContextInvalidatedRef: MutableRefObject<boolean>;
};

export const useWorkspaceChatSessions = ({
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
}: UseWorkspaceChatSessionsInput) => {
  const pendingNewSessionWorkspaceIdRef = useRef<string | null>(null);
  const saveSessionTimerRef = useRef<number | null>(null);
  const workspaceSidebarSessionsSignatureRef = useRef("");
  const workspaceSidebarSessionsRequestIdRef = useRef(0);
  const defaultSidebarSessionsWorkspaceIdRef = useRef("");
  const defaultSidebarSessionsRequestIdRef = useRef(0);
  const sessionsRequestIdRef = useRef(0);
  const isHydratingSessionRef = useRef(false);
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
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [, setIsSessionSaving] = useState(false);
  const [sessionsError, setSessionsError] = useState("");

  const {
    allSidebarWorkspaces,
    defaultWorkspace,
    isActiveDefaultWorkspace,
    sidebarWorkspaces,
    sidebarWorkspacesSignature,
    sidebarChatSessions,
  } = useSidebarSessions({
    workspace,
    workspaceSections,
    chatSessions,
    defaultChatSessions,
  });

  const updateSessionUnreadState = useCallback((
    workspacePath: string,
    sessionId: string,
    isUnread: boolean,
  ) => {
    const updateSessions = (sessions: ChatSessionMeta[]) =>
      sessions.map((session) =>
        session.id === sessionId
          ? { ...session, isUnread }
          : session,
      );

    if (workspace.path === workspacePath) {
      setChatSessions(updateSessions);
    }

    if (defaultWorkspace?.path === workspacePath) {
      setDefaultChatSessions(updateSessions);
    }

    const targetWorkspace = allSidebarWorkspaces.find((item) => item.path === workspacePath);
    if (targetWorkspace) {
      setWorkspaceSessionsById((current) => {
        const sessions = current[targetWorkspace.id];
        if (!sessions) {
          return current;
        }

        return {
          ...current,
          [targetWorkspace.id]: updateSessions(sessions),
        };
      });
    }
  }, [allSidebarWorkspaces, defaultWorkspace?.path, workspace.path]);

  const markSessionRead = useCallback((workspacePath: string, sessionId: string) => {
    updateSessionUnreadState(workspacePath, sessionId, false);
    void setChatSessionUnread({
      workspacePath,
      sessionId,
      isUnread: false,
    }).catch((caught) => {
      setSessionsError(String(caught));
    });
  }, [updateSessionUnreadState]);

  const hydrateSession = useCallback((
    session: HydratableChatSession | null,
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
    setAgentSessionStatus(null);
    setAgentSessionError("");
    clearExpandedAgentBlocks();
    if (runningTask) {
      applyActiveAgentTaskState(runningTask, { restoreTerminalState: false });
    } else {
      setAgentRuntimeSessionId(null);
    }
    window.setTimeout(() => {
      isHydratingSessionRef.current = false;
    }, 0);
  }, [
    agentContextInvalidatedRef,
    applyActiveAgentTaskState,
    clearExpandedAgentBlocks,
    conversationContextRef,
    conversationRef,
    currentSessionIdRef,
    currentSessionTitleRef,
    detachActiveAgentTask,
    messagesRef,
    preferredContextEngineIdRef,
    replaceChatTrace,
    runningAgentTasksRef,
    setAgentRuntimeSessionId,
    setAgentSessionError,
    setAgentSessionStatus,
    setContextDebugSnapshot,
    setContextEngineId,
    setConversation,
    setConversationContext,
    setCurrentSessionId,
    setCurrentSessionTitle,
    setMessages,
    workspace.path,
  ]);

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
        clearAgentQuestionDraft();
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

      hydrateSession(toHydratableSession(targetSession));
      if (targetSession?.id) {
        markSessionRead(workspace.path, targetSession.id);
      }
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
    clearAgentQuestionDraft,
    closeSettingsAndContextPanels,
    hydrateSession,
    isActiveDefaultWorkspace,
    markSessionRead,
    pendingDefaultSessionId,
    pendingWorkspaceSession,
    setComposerResetKey,
    setIsContextPanelOpen,
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

  const loadSessionById = useCallback(async (sessionId: string) => {
    closeSettingsAndContextPanels();

    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const session = await loadChatSession(workspace.path, sessionId);
      if (!session) {
        setSessionsError("未找到这条聊天记录");
        return;
      }
      hydrateSession(toHydratableSession(session));
      markSessionRead(workspace.path, session.id);
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  }, [closeSettingsAndContextPanels, hydrateSession, markSessionRead, workspace.path]);

  const startNewSession = useCallback(() => {
    closeSettingsAndContextPanels();

    setSessionsError("");
    setIsContextPanelOpen(false);
    setComposerResetKey((current) => current + 1);
    clearAgentQuestionDraft();
    setPendingDefaultSessionId(null);
    setPendingWorkspaceSession(null);
    pendingNewSessionWorkspaceIdRef.current = null;
    hydrateSession(null);
  }, [
    clearAgentQuestionDraft,
    closeSettingsAndContextPanels,
    hydrateSession,
    setComposerResetKey,
    setIsContextPanelOpen,
  ]);

  const removeSession = useCallback(async (sessionId: string) => {
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
        hydrateSession(toHydratableSession(latestSession));
      }
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  }, [currentSessionId, hydrateSession, isAgentTaskRunningForSession, workspace.path]);

  const startSidebarSession = useCallback(() => {
    startNewSession();
  }, [startNewSession]);

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
  }, [
    messagesRef,
    onOpenWorkspace,
    pendingAgentQuestion,
    visibleActiveAgentTaskId,
    workspace.id,
  ]);

  const loadDefaultSessionById = useCallback(async (sessionId: string) => {
    if (!isActiveDefaultWorkspace && defaultWorkspace) {
      pendingNewSessionWorkspaceIdRef.current = null;
      setPendingDefaultSessionId(sessionId);
      onOpenWorkspace(defaultWorkspace);
      return;
    }

    await loadSessionById(sessionId);
  }, [defaultWorkspace, isActiveDefaultWorkspace, loadSessionById, onOpenWorkspace]);

  const loadWorkspaceSessionById = useCallback(async (targetWorkspace: Workspace, sessionId: string) => {
    if (targetWorkspace.id === workspace.id) {
      pendingNewSessionWorkspaceIdRef.current = null;
      await loadSessionById(sessionId);
      return;
    }

    pendingNewSessionWorkspaceIdRef.current = null;
    setPendingWorkspaceSession({ workspaceId: targetWorkspace.id, sessionId });
    onOpenWorkspace(targetWorkspace);
  }, [loadSessionById, onOpenWorkspace, workspace.id]);

  const removeDefaultSession = useCallback(async (sessionId: string) => {
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
  }, [defaultWorkspace, isActiveDefaultWorkspace, isAgentTaskRunningForSession, removeSession]);

  const removeWorkspaceSession = useCallback(async (targetWorkspace: Workspace, sessionId: string) => {
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
  }, [isActiveDefaultWorkspace, isAgentTaskRunningForSession, removeSession, workspace.id]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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
        isUnread: false,
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
              isUnread: false,
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
  }, [
    chatTrace,
    conversation,
    conversationContext,
    currentSessionId,
    currentSessionIdRef,
    currentSessionTitle,
    currentSessionTitleRef,
    messages,
    setCurrentSessionId,
    setCurrentSessionTitle,
    workspace.path,
  ]);

  return {
    allSidebarWorkspaces,
    defaultWorkspace,
    isActiveDefaultWorkspace,
    sidebarWorkspaces,
    sidebarChatSessions,
    chatSessions,
    setChatSessions,
    isDefaultSessionsLoading,
    workspaceSessionsById,
    isWorkspaceSessionsLoading,
    currentSessionId,
    currentSessionTitle,
    isSessionsLoading,
    sessionsError,
    setSessionsError,
    hydrateSession,
    startSidebarSession,
    openWorkspaceFromCurrentContext,
    loadDefaultSessionById,
    loadWorkspaceSessionById,
    removeDefaultSession,
    removeWorkspaceSession,
  };
};
