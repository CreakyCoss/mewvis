import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useMatch } from "react-router";
import { listWorkspaces, type Workspace } from "@/api/workspace";
import { Spinner } from "@/components/ui/spinner";
import { Chat } from "./chat";
import type { ChatInitialData, ChatSaveInput } from "./chat/type";
import type { ChatInputResources } from "./components/chat-input/type";
import { useWorkspaceStore } from "./workspace-store";
import { useWorkspaceFileStore, WorkspaceFileWatcher } from "./workspace-files";
import { loadResources } from "./resources";
import { WorkspaceChatSidebar } from "./sidebar";

const defaultDisplayOptions = {
  showThinkingProcess: true,
  showToolCallProcess: true,
};

type WorkspaceChatState = {
  workspace: Workspace | null;
  resources: ChatInputResources;
  isLoading: boolean;
  error: string;
};

const initialState: WorkspaceChatState = {
  workspace: null,
  resources: {},
  isLoading: true,
  error: "",
};

type WorkspaceChatProps = {
  workspaceId: string;
  chatId: string;
  initialData?: ChatInitialData;
  isActive: boolean;
};

const loadWorkspace = async (workspaceId: string, initialResources?: ChatInputResources) => {
  const workspace = (await listWorkspaces())
    .map((item) => (item.isDefault ? { ...item, name: "默认工作区" } : item))
    .find((item) => item.id === workspaceId);

  if (!workspace) {
    throw new Error("工作区不存在");
  }

  return {
    workspace,
    resources: initialResources ?? (await loadResources()),
  };
};

const WorkspaceChat = ({ workspaceId, chatId, initialData: providedInitialData, isActive }: WorkspaceChatProps) => {
  const workspaceStore = useWorkspaceStore();
  const fileStore = useWorkspaceFileStore();
  const [state, setState] = useState(initialState);
  const initialData = useMemo<ChatInitialData>(
    () =>
      providedInitialData ?? {
        resources: state.resources,
        displayOptions: defaultDisplayOptions,
      },
    [providedInitialData, state.resources],
  );

  useEffect(() => {
    let cancelled = false;
    setState(initialState);

    if (!workspaceId) {
      setState({ ...initialState, isLoading: false, error: "工作区地址无效" });
      return () => {
        cancelled = true;
      };
    }

    void loadWorkspace(workspaceId, providedInitialData?.resources)
      .then(({ workspace, resources }) => {
        if (!cancelled) {
          setState({ workspace, resources, isLoading: false, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            ...initialState,
            isLoading: false,
            error: error instanceof Error ? error.message : "工作区会话加载失败",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providedInitialData?.resources, workspaceId]);

  useEffect(() => {
    if (isActive && state.workspace) {
      workspaceStore.setCurrentWorkspace(state.workspace);
    }
  }, [isActive, state.workspace, workspaceStore.setCurrentWorkspace]);

  const saveWorkspaceChat = useCallback(
    (input: ChatSaveInput) => {
      if (!state.workspace) {
        return Promise.reject(new Error("工作区尚未加载完成"));
      }

      return workspaceStore.saveChat(state.workspace, input);
    },
    [state.workspace, workspaceStore.saveChat],
  );

  if (!workspaceId || !chatId) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-sm text-destructive">
        会话地址无效
      </main>
    );
  }

  if (state.isLoading || !state.workspace) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center gap-2 bg-background px-6 text-sm text-muted-foreground">
        {state.error ? null : <Spinner />}
        <span>{state.error || "正在加载工作区会话"}</span>
      </main>
    );
  }

  const workspace = state.workspace;

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-surface/45">
      <div className="min-w-0 flex-1 overflow-hidden bg-background/95">
        <Chat
          chatId={chatId}
          workspacePath={workspace.path}
          files={fileStore.workspacePath === workspace.path ? fileStore.files : []}
          initialData={initialData}
          saveChat={saveWorkspaceChat}
          onStatusChange={({ chatId: statusChatId, isRunning }) =>
            workspaceStore.setChatLoading(workspaceId, statusChatId, isRunning)
          }
        />
      </div>
      {isActive ? (
        <WorkspaceChatSidebar workspacePath={workspace.path} chatId={chatId} panels={["files", "version", "ledger"]} />
      ) : null}
    </div>
  );
};

export const WorkspaceChatRoute = () => {
  const workspaceChatRoute = useMatch("/chats/:workspaceId/:chatId");
  const workspaceStore = useWorkspaceStore();
  const workspaceId = workspaceChatRoute?.params.workspaceId ?? "";
  const chatId = workspaceChatRoute?.params.chatId ?? "";
  const isWorkspaceChatRoute = Boolean(workspaceChatRoute);
  const isOpen = workspaceStore.openChats.some((chat) => chat.workspaceId === workspaceId && chat.chatId === chatId);
  const openChats =
    workspaceChatRoute && !isOpen ? [...workspaceStore.openChats, { workspaceId, chatId }] : workspaceStore.openChats;

  useEffect(() => {
    if (isWorkspaceChatRoute) {
      workspaceStore.openChat({ workspaceId, chatId });
    } else {
      workspaceStore.setCurrentChat(null);
    }
  }, [chatId, isWorkspaceChatRoute, workspaceId, workspaceStore.openChat, workspaceStore.setCurrentChat]);

  return (
    <>
      <WorkspaceFileWatcher workspacePath={workspaceStore.currentWorkspace?.path ?? ""} />
      {openChats.map((chat) => {
        const isActive = workspaceId === chat.workspaceId && chatId === chat.chatId;

        return (
          <div key={`${chat.workspaceId}:${chat.chatId}`} hidden={!isActive} className="min-h-0 flex-1">
            <WorkspaceChat
              workspaceId={chat.workspaceId}
              chatId={chat.chatId}
              initialData={chat.initialData}
              isActive={isActive}
            />
          </div>
        );
      })}
      <Outlet />
    </>
  );
};
