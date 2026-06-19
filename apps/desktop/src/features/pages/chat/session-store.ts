import { create } from "zustand";
import type { Workspace } from "@/features/pages/workspace/types";
import {
  deleteChatSession,
  listChatSessions,
} from "./api";
import type {
  ChatSession,
  ChatSessionMeta,
} from "./types";

const chatSessionRequestIds = new Map<string, number>();

const sessionKey = (workspacePath: string, sessionId: string) =>
  `${workspacePath}\u0000${sessionId}`;

const sortSessions = (sessions: ChatSessionMeta[]) =>
  [...sessions].sort((left, right) =>
    right.createdAt - left.createdAt || right.id.localeCompare(left.id)
  );

const sessionToMeta = (
  session: ChatSession,
  previous?: ChatSessionMeta,
): ChatSessionMeta => ({
  id: session.id,
  title: session.title,
  path: previous?.path ?? "",
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  messageCount: session.messages.length,
  isUnread: session.isUnread ?? previous?.isUnread ?? false,
});

const upsertSessionMeta = (
  sessions: ChatSessionMeta[],
  session: ChatSessionMeta,
) => {
  const previous = sessions.find((item) => item.id === session.id);
  const nextSession = {
    ...previous,
    ...session,
    createdAt: previous?.createdAt ?? session.createdAt,
  };

  return sortSessions([
    nextSession,
    ...sessions.filter((item) => item.id !== session.id),
  ]);
};

type ChatSessionsStore = {
  sessionsByWorkspaceId: Record<string, ChatSessionMeta[]>;
  loadingWorkspaceIds: Record<string, boolean>;
  errorByWorkspaceId: Record<string, string>;
  runningSessionKeys: Record<string, boolean>;
  deletingSessionKeys: Record<string, boolean>;
  loadWorkspaceSessions: (workspace: Workspace) => Promise<void>;
  setWorkspaceSessions: (workspaceId: string, sessions: ChatSessionMeta[]) => void;
  upsertSession: (workspaceId: string, session: ChatSession) => void;
  upsertSessionMeta: (workspaceId: string, session: ChatSessionMeta) => void;
  setSessionUnread: (workspaceId: string, sessionId: string, isUnread: boolean) => void;
  setSessionRunning: (workspacePath: string, sessionId: string, isRunning: boolean) => void;
  deleteSession: (workspace: Workspace, sessionId: string) => Promise<void>;
};

export const useChatSessionsStore = create<ChatSessionsStore>((set, get) => ({
  sessionsByWorkspaceId: {},
  loadingWorkspaceIds: {},
  errorByWorkspaceId: {},
  runningSessionKeys: {},
  deletingSessionKeys: {},
  loadWorkspaceSessions: async (workspace) => {
    const requestId = (chatSessionRequestIds.get(workspace.id) ?? 0) + 1;
    chatSessionRequestIds.set(workspace.id, requestId);
    set((state) => ({
      loadingWorkspaceIds: {
        ...state.loadingWorkspaceIds,
        [workspace.id]: true,
      },
      errorByWorkspaceId: {
        ...state.errorByWorkspaceId,
        [workspace.id]: "",
      },
    }));

    try {
      const sessions = await listChatSessions(workspace.path);
      if (chatSessionRequestIds.get(workspace.id) !== requestId) {
        return;
      }
      get().setWorkspaceSessions(workspace.id, sessions);
    } catch (caught) {
      if (chatSessionRequestIds.get(workspace.id) !== requestId) {
        return;
      }
      set((state) => ({
        errorByWorkspaceId: {
          ...state.errorByWorkspaceId,
          [workspace.id]: String(caught),
        },
      }));
    } finally {
      if (chatSessionRequestIds.get(workspace.id) === requestId) {
        set((state) => ({
          loadingWorkspaceIds: {
            ...state.loadingWorkspaceIds,
            [workspace.id]: false,
          },
        }));
      }
    }
  },
  setWorkspaceSessions: (workspaceId, sessions) => set((state) => ({
    sessionsByWorkspaceId: {
      ...state.sessionsByWorkspaceId,
      [workspaceId]: sortSessions(sessions),
    },
    errorByWorkspaceId: {
      ...state.errorByWorkspaceId,
      [workspaceId]: "",
    },
  })),
  upsertSession: (workspaceId, session) => set((state) => {
    const sessions = state.sessionsByWorkspaceId[workspaceId] ?? [];
    const previous = sessions.find((item) => item.id === session.id);

    return {
      sessionsByWorkspaceId: {
        ...state.sessionsByWorkspaceId,
        [workspaceId]: upsertSessionMeta(sessions, sessionToMeta(session, previous)),
      },
    };
  }),
  upsertSessionMeta: (workspaceId, session) => set((state) => {
    const sessions = state.sessionsByWorkspaceId[workspaceId] ?? [];

    return {
      sessionsByWorkspaceId: {
        ...state.sessionsByWorkspaceId,
        [workspaceId]: upsertSessionMeta(sessions, session),
      },
    };
  }),
  setSessionUnread: (workspaceId, sessionId, isUnread) => set((state) => {
    const sessions = state.sessionsByWorkspaceId[workspaceId] ?? [];

    return {
      sessionsByWorkspaceId: {
        ...state.sessionsByWorkspaceId,
        [workspaceId]: sessions.map((session) =>
          session.id === sessionId
            ? { ...session, isUnread }
            : session
        ),
      },
    };
  }),
  setSessionRunning: (workspacePath, sessionId, isRunning) => set((state) => {
    const key = sessionKey(workspacePath, sessionId);
    const next = { ...state.runningSessionKeys };
    if (isRunning) {
      next[key] = true;
    } else {
      delete next[key];
    }

    return {
      runningSessionKeys: next,
    };
  }),
  deleteSession: async (workspace, sessionId) => {
    const key = sessionKey(workspace.path, sessionId);
    set((state) => ({
      deletingSessionKeys: {
        ...state.deletingSessionKeys,
        [key]: true,
      },
      errorByWorkspaceId: {
        ...state.errorByWorkspaceId,
        [workspace.id]: "",
      },
    }));

    try {
      const sessions = await deleteChatSession(workspace.path, sessionId);
      set((state) => {
        const nextRunningKeys = { ...state.runningSessionKeys };
        delete nextRunningKeys[key];

        return {
          sessionsByWorkspaceId: {
            ...state.sessionsByWorkspaceId,
            [workspace.id]: sortSessions(sessions),
          },
          runningSessionKeys: nextRunningKeys,
        };
      });
    } catch (caught) {
      set((state) => ({
        errorByWorkspaceId: {
          ...state.errorByWorkspaceId,
          [workspace.id]: String(caught),
        },
      }));
    } finally {
      set((state) => {
        const nextDeletingKeys = { ...state.deletingSessionKeys };
        delete nextDeletingKeys[key];

        return {
          deletingSessionKeys: nextDeletingKeys,
        };
      });
    }
  },
}));

export const chatSessionKey = sessionKey;
