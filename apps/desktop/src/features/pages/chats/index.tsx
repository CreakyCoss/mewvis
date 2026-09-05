import { useEffect, useRef } from "react";
import { Outlet, useMatch } from "react-router";
import { Chat } from "@/chat/react";
import { useDesktopChatSession } from "@/chat/desktop/react";
import { useWorkspaceStore } from "./workspace-store";
import { WorkspaceFileWatcher } from "./workspace-files";
import { WorkspaceChatSidebar } from "./sidebar";
import { workspaceChatProfile } from "./profile";

function WorkspaceChat({ workspaceId, chatId, isActive }: { workspaceId: string; chatId: string; isActive: boolean }) {
  const store = useWorkspaceStore();
  const requestedWorkspaces = useRef(false);
  const workspace = store.workspaces.find((item) => item.id === workspaceId);
  const { session, error } = useDesktopChatSession(
    workspace
      ? {
          identity: { scope: `workspace:${workspaceId}`, id: chatId },
          workspacePath: workspace.path,
          profile: workspaceChatProfile,
        }
      : null,
  );
  useEffect(() => {
    if (!requestedWorkspaces.current && !store.workspaces.length && !store.isLoading && !store.error) {
      requestedWorkspaces.current = true;
      void store.loadWorkspaces();
    }
  }, [store.workspaces.length, store.isLoading, store.error, store.loadWorkspaces]);
  useEffect(() => {
    if (isActive && workspace) store.setCurrentWorkspace(workspace);
  }, [isActive, workspace, store.setCurrentWorkspace]);
  if (!session || !workspace)
    return (
      <Chat.Loading
        error={
          error ||
          store.error ||
          (!workspace && !store.isLoading && requestedWorkspaces.current ? "工作区不存在" : undefined)
        }
      />
    );
  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-surface/45">
      <div className="min-w-0 flex-1 overflow-hidden bg-background/95">
        <Chat session={session} />
      </div>
      {isActive ? (
        <Chat.Provider session={session} viewId="sidebar">
          <WorkspaceChatSidebar
            workspacePath={workspace.path}
            chatId={chatId}
            panels={["files", "version", "ledger"]}
          />
        </Chat.Provider>
      ) : null}
    </div>
  );
}
export function WorkspaceChatRoute() {
  const route = useMatch("/chats/:workspaceId/:chatId");
  const store = useWorkspaceStore();
  const workspaceId = route?.params.workspaceId ?? "";
  const chatId = route?.params.chatId ?? "";
  const openChats =
    route && !store.openChats.some((chat) => chat.workspaceId === workspaceId && chat.chatId === chatId)
      ? [...store.openChats, { workspaceId, chatId }]
      : store.openChats;
  useEffect(() => {
    if (workspaceId && chatId) store.openChat({ workspaceId, chatId });
    else store.setCurrentChat(null);
  }, [workspaceId, chatId, store.openChat, store.setCurrentChat]);
  return (
    <>
      <WorkspaceFileWatcher workspacePath={store.currentWorkspace?.path ?? ""} />
      {openChats.map((chat) => {
        const isActive = chat.workspaceId === workspaceId && chat.chatId === chatId;
        return (
          <div key={`${chat.workspaceId}:${chat.chatId}`} hidden={!isActive} className="min-h-0 flex-1">
            <WorkspaceChat {...chat} isActive={isActive} />
          </div>
        );
      })}
      <Outlet />
    </>
  );
}
