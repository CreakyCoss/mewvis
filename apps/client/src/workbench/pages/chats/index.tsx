import { useEffect, useRef } from "react";
import { Outlet, useMatch } from "react-router";
import { Chat } from "@/chat/react";
import { useDesktopChatRecord } from "@/chat/desktop/react";
import { useWorkspaceStore } from "./workspace-store";
import { WorkspaceFileWatcher } from "./workspace-files";
import { WorkspaceChatPanels } from "./panels";
import { workspaceChatProfile } from "./profile";
import { ModelSetupDialog } from "./components/model-setup-dialog";
import { ComposerActionSlot, HeaderActionSlot } from "@mewvis/extension-host/ui/slots/action";

function WorkspaceChat({ workspaceId, chatId, isActive }: { workspaceId: string; chatId: string; isActive: boolean }) {
  const store = useWorkspaceStore();
  const requestedWorkspaces = useRef(false);
  const workspace = store.workspaces.find((item) => item.id === workspaceId);
  const { session, history, error, reload, connecting, retryError } = useDesktopChatRecord(
    workspace
      ? {
          identity: { scope: `workspace:${workspaceId}`, id: chatId },
          workspaceId: workspaceId,
          origin: { kind: "builtin", sceneId: "chat" },
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
  if (history && workspace)
    return (
      <Chat.History
        messages={history.messages}
        displayOptions={history.preferences}
        reason={history.reason}
        onRetry={history.canRetry ? reload : undefined}
        connecting={connecting}
        retryError={retryError}
      />
    );
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background/95">
        <div className="flex shrink-0 justify-end gap-1 empty:hidden px-4 pt-2 sm:px-8">
          <HeaderActionSlot context={{ workspacePath: workspace.path, chatId }} />
        </div>
        <div className="min-h-0 flex-1">
          <Chat
            session={session}
            composer={{ children: <ComposerActionSlot context={{ workspacePath: workspace.path, chatId }} /> }}
          />
        </div>
      </div>
      {isActive ? (
        <Chat.Provider session={session} viewId="sidebar">
          <WorkspaceChatPanels workspacePath={workspace.path} chatId={chatId} />
        </Chat.Provider>
      ) : null}
    </div>
  );
}
export function WorkspaceChatRoute() {
  const route = useMatch("/chats/:workspaceId/:chatId");
  const homeRoute = useMatch("/chat");
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
      {route || homeRoute ? <ModelSetupDialog key={route?.pathname ?? homeRoute?.pathname} /> : null}
    </>
  );
}
