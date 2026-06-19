import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from "react";
import type { Workspace, WorkspaceSection } from "@/features/pages/workspace/types";
import {
  listChatSessions,
  loadChatSession,
  saveChatSession,
  setChatSessionUnread,
} from "../../api";
import type {
  ChatMessage,
  ChatSessionMeta,
} from "../../types";
import {
  sortChatSessionsByFixedOrder,
  toHydratableSession,
  upsertChatSessionMeta,
  type HydratableChatSession,
} from "./history";
import type { RunningAgentTaskContext } from "./use-running-agent-tasks";
import { DEFAULT_SESSION_TITLE, deriveSessionTitle } from "../../utils/sessions";

type UseWorkspaceChatSessionsInput = {
  workspace: Workspace;
  workspaceSections: WorkspaceSection[];
  route: {
    sessionId: string | null;
    isNewSession: boolean;
    onSessionCreated?: (sessionId: string) => void;
  };
  navigation: {
    onOpenWorkspace: (workspace: Workspace) => void;
    closePanels: () => void;
  };
  ui: {
    setComposerResetKey: Dispatch<SetStateAction<number>>;
    clearAgentQuestionDraft: () => void;
  };
  chat: {
    currentSessionId: string | null;
    setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
    currentSessionTitle: string;
    setCurrentSessionTitle: Dispatch<SetStateAction<string>>;
    currentSessionIdRef: MutableRefObject<string | null>;
    currentSessionTitleRef: MutableRefObject<string>;
    messages: ChatMessage[];
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
    messagesRef: MutableRefObject<ChatMessage[]>;
  };
  agentTasks: {
    runningAgentTasksRef: MutableRefObject<Map<string, RunningAgentTaskContext>>;
    detachActiveAgentTask: () => void;
    applyActiveAgentTaskState: (
      task: RunningAgentTaskContext,
      options?: { restoreTerminalState?: boolean },
    ) => void;
  };
};

export const useWorkspaceChatSessions = ({
  workspace,
  workspaceSections,
  route,
  navigation,
  ui,
  chat,
  agentTasks,
}: UseWorkspaceChatSessionsInput) => {
  const {
    sessionId: routeSessionId,
    isNewSession: isRouteNewSession,
    onSessionCreated,
  } = route;
  const {
    onOpenWorkspace,
    closePanels,
  } = navigation;
  const {
    setComposerResetKey,
    clearAgentQuestionDraft,
  } = ui;
  const {
    currentSessionId,
    setCurrentSessionId,
    currentSessionTitle,
    setCurrentSessionTitle,
    currentSessionIdRef,
    currentSessionTitleRef,
    messages,
    setMessages,
    messagesRef,
  } = chat;
  const {
    runningAgentTasksRef,
    detachActiveAgentTask,
    applyActiveAgentTaskState,
  } = agentTasks;
  const saveSessionTimerRef = useRef<number | null>(null);
  const sessionsRequestIdRef = useRef(0);
  const isHydratingSessionRef = useRef(false);
  const hydratedWorkspacePathRef = useRef(workspace.path);
  const [, setChatSessions] = useState<ChatSessionMeta[]>([]);
  const [, setIsSessionsLoading] = useState(false);
  const [, setIsSessionSaving] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const allSidebarWorkspaces = useMemo(
    () => workspaceSections.flatMap((section) => section.workspaces),
    [workspaceSections],
  );

  const updateSessionUnreadState = useCallback((
    workspacePath: string,
    sessionId: string,
    isUnread: boolean,
  ) => {
    if (workspace.path !== workspacePath) {
      return;
    }

    const updateSessions = (sessions: ChatSessionMeta[]) =>
      sessions.map((session) =>
        session.id === sessionId
          ? { ...session, isUnread }
          : session,
      );

    setChatSessions(updateSessions);
  }, [workspace.path]);

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
    hydratedWorkspacePathRef.current = workspace.path;
    const runningTask = session?.id
      ? [...runningAgentTasksRef.current.values()].find((task) =>
        task.workspacePath === workspace.path && task.sessionId === session.id
      )
      : null;
    const hydratedMessages = runningTask?.messages ?? session?.messages ?? [];
    messagesRef.current = hydratedMessages;
    setMessages(hydratedMessages);
    const nextSessionId = session?.id ?? null;
    const nextSessionTitle = session?.title || DEFAULT_SESSION_TITLE;
    currentSessionIdRef.current = nextSessionId;
    currentSessionTitleRef.current = nextSessionTitle;
    setCurrentSessionId(nextSessionId);
    setCurrentSessionTitle(nextSessionTitle);
    if (runningTask) {
      applyActiveAgentTaskState(runningTask, { restoreTerminalState: false });
    }
    window.setTimeout(() => {
      isHydratingSessionRef.current = false;
    }, 0);
  }, [
    applyActiveAgentTaskState,
    currentSessionIdRef,
    currentSessionTitleRef,
    detachActiveAgentTask,
    messagesRef,
    runningAgentTasksRef,
    setCurrentSessionId,
    setCurrentSessionTitle,
    setMessages,
    workspace.path,
  ]);

  const loadSessions = useCallback(async () => {
    const requestId = sessionsRequestIdRef.current + 1;
    sessionsRequestIdRef.current = requestId;
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
      saveSessionTimerRef.current = null;
    }
    isHydratingSessionRef.current = true;
    hydratedWorkspacePathRef.current = "";
    setIsSessionsLoading(true);
    setSessionsError("");
    const routeSessionIdToLoad = isRouteNewSession ? null : routeSessionId;
    const sessionIdToLoad = routeSessionIdToLoad;
    const shouldStartEmptySession = isRouteNewSession;

    try {
      const sessions = await listChatSessions(workspace.path);
      const targetSessionId = sessionIdToLoad ?? sessions[0]?.id ?? null;
      const targetSession = shouldStartEmptySession || !targetSessionId
        ? null
        : await loadChatSession(workspace.path, targetSessionId);
      if (sessionsRequestIdRef.current !== requestId) {
        return;
      }
      setChatSessions(sortChatSessionsByFixedOrder(sessions));
      if (shouldStartEmptySession) {
        closePanels();
        setSessionsError("");
        setComposerResetKey((current) => current + 1);
        clearAgentQuestionDraft();
        hydrateSession(null);
        return;
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
        window.setTimeout(() => {
          if (sessionsRequestIdRef.current === requestId && hydratedWorkspacePathRef.current !== workspace.path) {
            isHydratingSessionRef.current = false;
          }
        }, 0);
      }
    }
  }, [
    clearAgentQuestionDraft,
    closePanels,
    hydrateSession,
    isRouteNewSession,
    markSessionRead,
    routeSessionId,
    setComposerResetKey,
    workspace.path,
  ]);

  const openWorkspaceFromCurrentContext = useCallback((targetWorkspace: Workspace) => {
    onOpenWorkspace(targetWorkspace);
  }, [onOpenWorkspace]);

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

    if (hydratedWorkspacePathRef.current !== workspace.path) {
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

    const wasNewSession = !currentSessionId;

    saveSessionTimerRef.current = window.setTimeout(() => {
      setIsSessionSaving(true);
      setSessionsError("");

      void saveChatSession({
        workspacePath: workspace.path,
        sessionId: currentSessionId,
        title,
        messages,
        isUnread: false,
      })
        .then((session) => {
          currentSessionIdRef.current = session.id;
          currentSessionTitleRef.current = session.title;
          setCurrentSessionId(session.id);
          setCurrentSessionTitle(session.title);
          if (wasNewSession) {
            onSessionCreated?.(session.id);
          }
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
    currentSessionId,
    currentSessionIdRef,
    currentSessionTitle,
    currentSessionTitleRef,
    messages,
    onSessionCreated,
    setCurrentSessionId,
    setCurrentSessionTitle,
    workspace.path,
  ]);

  return {
    allSidebarWorkspaces,
    setChatSessions,
    sessionsError,
    setSessionsError,
    openWorkspaceFromCurrentContext,
  };
};
