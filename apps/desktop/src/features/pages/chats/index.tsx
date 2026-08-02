import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useMatch } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { Chat } from "./chat";
import type { ChatSaveInput } from "./chat/type";
import type { ChatInputOptions, ChatTurnRequest } from "./components/chat-input/type";
import { useWorkspaceStore } from "./workspace-store";
import { useWorkspaceFileStore, WorkspaceFileWatcher } from "./workspace-files";
import { WorkspaceChatSidebar } from "./sidebar";

type WorkspaceChatProps = {
  workspaceId: string;
  chatId: string;
  initialTurn?: ChatTurnRequest;
  isActive: boolean;
};

const WorkspaceChat = ({ workspaceId, chatId, initialTurn, isActive }: WorkspaceChatProps) => {
  const workspaceStore = useWorkspaceStore();
  const fileStore = useWorkspaceFileStore();
  const [options, setOptions] = useState<ChatInputOptions | null>(null);
  const workspace = workspaceStore.workspaces.find((item) => item.id === workspaceId) ?? null;
  const resources = workspaceStore.resources;
  const selectedModel = useMemo(
    () => resources.models?.find((model) => model.value === options?.selectedModelId)?.runtimeModel ?? null,
    [options?.selectedModelId, resources.models],
  );

  useEffect(() => {
    if (workspaceStore.workspaces.length === 0 && !workspaceStore.isLoading && !workspaceStore.error) {
      void workspaceStore.loadWorkspaces();
    }
  }, [workspaceStore.error, workspaceStore.isLoading, workspaceStore.loadWorkspaces, workspaceStore.workspaces.length]);

  useEffect(() => {
    if (isActive && workspace) {
      workspaceStore.setCurrentWorkspace(workspace);
    }
  }, [isActive, workspace, workspaceStore.setCurrentWorkspace]);

  const saveWorkspaceChat = useCallback(
    (input: ChatSaveInput) => {
      if (!workspace) {
        return Promise.reject(new Error("工作区尚未加载完成"));
      }

      return workspaceStore.saveChat(workspace, input);
    },
    [workspace, workspaceStore.saveChat],
  );

  if (!workspaceId || !chatId) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-sm text-destructive">
        会话地址无效
      </main>
    );
  }

  const isLoading = workspaceStore.isLoading || (workspaceStore.workspaces.length === 0 && !workspaceStore.error);
  const error = isLoading ? "" : workspaceStore.error || (!workspace ? "工作区不存在" : "");

  if (isLoading || !workspace) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center gap-2 bg-background px-6 text-sm text-muted-foreground">
        {error ? null : <Spinner />}
        <span>{error || "正在加载工作区会话"}</span>
      </main>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-surface/45">
      <div className="min-w-0 flex-1 overflow-hidden bg-background/95">
        <Chat
          chatId={chatId}
          workspacePath={workspace.path}
          resources={resources}
          files={fileStore.workspacePath === workspace.path ? fileStore.files : []}
          initialTurn={initialTurn}
          saveChat={saveWorkspaceChat}
          onStatusChange={({ chatId: statusChatId, isRunning }) =>
            workspaceStore.setChatLoading(workspaceId, statusChatId, isRunning)
          }
          onOptionsChange={setOptions}
        />
      </div>
      {isActive ? (
        <WorkspaceChatSidebar
          workspacePath={workspace.path}
          chatId={chatId}
          selectedModel={selectedModel}
          panels={["files", "version", "ledger"]}
        />
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
              initialTurn={chat.initialTurn}
              isActive={isActive}
            />
          </div>
        );
      })}
      <Outlet />
    </>
  );
};
