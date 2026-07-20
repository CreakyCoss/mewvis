import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from "react";
import { listChatSessions, loadChatSession, saveChatSession, setChatSessionUnread } from "@/api/chat";
import type { Workspace } from "@/features/pages/workspace/types";
import { useChatSessionsStore } from "../../session-store";
import type { ChatMessage } from "../../types";
import { settleOrphanedAgentMessages } from "../../utils/agent-task-lifecycle";
import { toHydratableSession, type HydratableChatSession } from "./history";
import type { RunningAgentTaskContext } from "./use-running-agent-tasks";
import { DEFAULT_SESSION_TITLE, deriveSessionTitle } from "../../utils/sessions";

type UseWorkspaceChatSessionsInput = {
  workspace: Workspace;
  route: {
    sessionId: string | null;
    isNewSession: boolean;
    onSessionCreated?: (sessionId: string) => void;
    sessionSeed?: HydratableChatSession | null;
  };
  navigation: {
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
    applyActiveAgentTaskState: (task: RunningAgentTaskContext, options?: { restoreTerminalState?: boolean }) => void;
  };
};

export const useWorkspaceChatSessions = ({
  workspace,
  route,
  navigation,
  ui,
  chat,
  agentTasks,
}: UseWorkspaceChatSessionsInput) => {
  const { sessionId: routeSessionId, isNewSession: isRouteNewSession, onSessionCreated, sessionSeed = null } = route;
  const { closePanels } = navigation;
  const { setComposerResetKey, clearAgentQuestionDraft } = ui;
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
  const { runningAgentTasksRef, detachActiveAgentTask, applyActiveAgentTaskState } = agentTasks;
  const saveSessionTimerRef = useRef<number | null>(null);
  const sessionsRequestIdRef = useRef(0);
  const isHydratingSessionRef = useRef(false);
  const hydratedWorkspacePathRef = useRef(workspace.path);
  const [sessionsError, setSessionsError] = useState("");
  const setWorkspaceSessions = useChatSessionsStore((store) => store.setWorkspaceSessions);
  const upsertSession = useChatSessionsStore((store) => store.upsertSession);
  const setSessionUnread = useChatSessionsStore((store) => store.setSessionUnread);

  const markSessionRead = useCallback(
    (workspacePath: string, sessionId: string) => {
      setSessionUnread(workspace.id, sessionId, false);
      void setChatSessionUnread({
        workspacePath,
        sessionId,
        isUnread: false,
      }).catch((caught) => {
        setSessionsError(String(caught));
      });
    },
    [setSessionUnread, workspace.id],
  );

  const hydrateSession = useCallback(
    (session: HydratableChatSession | null) => {
      if (saveSessionTimerRef.current) {
        window.clearTimeout(saveSessionTimerRef.current);
        saveSessionTimerRef.current = null;
      }
      detachActiveAgentTask();
      isHydratingSessionRef.current = true;
      hydratedWorkspacePathRef.current = workspace.path;
      const runningTask = session?.id
        ? [...runningAgentTasksRef.current.values()].find(
            (task) => task.workspacePath === workspace.path && task.sessionId === session.id,
          )
        : null;
      const storedMessages = session?.messages ?? [];
      const hydratedMessages = runningTask?.messages ?? settleOrphanedAgentMessages(storedMessages);
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
      } else if (session?.id && hydratedMessages !== storedMessages) {
        void saveChatSession({
          workspacePath: workspace.path,
          sessionId: session.id,
          title: session.title,
          messages: hydratedMessages,
          isUnread: false,
        })
          .then((savedSession) => upsertSession(workspace.id, savedSession))
          .catch((caught) => setSessionsError(String(caught)));
      }
      window.setTimeout(() => {
        isHydratingSessionRef.current = false;
      }, 0);
    },
    [
      applyActiveAgentTaskState,
      currentSessionIdRef,
      currentSessionTitleRef,
      detachActiveAgentTask,
      messagesRef,
      runningAgentTasksRef,
      setCurrentSessionId,
      setCurrentSessionTitle,
      setMessages,
      setSessionsError,
      upsertSession,
      workspace.id,
      workspace.path,
    ],
  );

  const loadSessions = useCallback(async () => {
    const requestId = sessionsRequestIdRef.current + 1;
    sessionsRequestIdRef.current = requestId;
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
      saveSessionTimerRef.current = null;
    }
    isHydratingSessionRef.current = true;
    hydratedWorkspacePathRef.current = "";
    setSessionsError("");
    const routeSessionIdToLoad = isRouteNewSession ? null : routeSessionId;
    const sessionIdToLoad = routeSessionIdToLoad;
    const shouldStartEmptySession = isRouteNewSession;

    try {
      const sessions = await listChatSessions(workspace.path);
      const targetSessionId = sessionIdToLoad ?? sessions[0]?.id ?? null;
      const targetSession =
        shouldStartEmptySession || !targetSessionId ? null : await loadChatSession(workspace.path, targetSessionId);
      if (sessionsRequestIdRef.current !== requestId) {
        return;
      }
      setWorkspaceSessions(workspace.id, sessions);
      if (shouldStartEmptySession) {
        closePanels();
        setSessionsError("");
        setComposerResetKey((current) => current + 1);
        clearAgentQuestionDraft();
        hydrateSession(sessionSeed);
        return;
      }

      hydrateSession(toHydratableSession(targetSession) ?? sessionSeed);
      if (targetSession?.id) {
        markSessionRead(workspace.path, targetSession.id);
      }
    } catch (caught) {
      if (sessionsRequestIdRef.current === requestId) {
        setSessionsError(String(caught));
      }
    } finally {
      if (sessionsRequestIdRef.current === requestId) {
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
    sessionSeed,
    routeSessionId,
    setComposerResetKey,
    setWorkspaceSessions,
    workspace.id,
    workspace.path,
  ]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(
    () => () => {
      if (saveSessionTimerRef.current) {
        window.clearTimeout(saveSessionTimerRef.current);
      }
    },
    [],
  );

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

    const derivedTitle = messages.length === 0 ? currentSessionTitle : deriveSessionTitle(messages);
    const title =
      derivedTitle === DEFAULT_SESSION_TITLE && currentSessionTitle !== DEFAULT_SESSION_TITLE
        ? currentSessionTitle
        : derivedTitle;
    if (title !== currentSessionTitle) {
      currentSessionTitleRef.current = title;
      setCurrentSessionTitle(title);
    }

    const wasNewSession = !currentSessionId;

    saveSessionTimerRef.current = window.setTimeout(() => {
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
          upsertSession(workspace.id, session);
          if (wasNewSession) {
            onSessionCreated?.(session.id);
          }
        })
        .catch((caught) => {
          setSessionsError(String(caught));
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
    upsertSession,
    workspace.id,
    workspace.path,
  ]);

  return {
    sessionsError,
    setSessionsError,
  };
};
