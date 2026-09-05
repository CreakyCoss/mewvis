import { connectNativePluginChat } from "./plugin-chat-native";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { useCallback, useEffect, type PropsWithChildren } from "react";
import { DesktopChatEnvironment } from "@/chat/desktop/react";
import { isChatBusy, sessionKey, type ChatSession } from "@/chat/core";
import { useWorkspaceStore } from "@/features/pages/chats/workspace-store";
import { useWorkspaceFileStore } from "@/features/pages/chats/workspace-files";
import { chatService } from "./chat-service";

export function AppChatIntegration({ children }: PropsWithChildren) {
  const fileState = useWorkspaceFileStore();
  const files = useCallback(
    (session: ChatSession) =>
      chatService.getLocation(session)?.workspacePath === fileState.workspacePath ? fileState.files : [],
    [fileState.workspacePath, fileState.files],
  );
  useEffect(() => {
    let integrationDisposed = false;
    let disconnectPlugins: (() => void) | undefined;
    void connectNativePluginChat()
      .then((detach) => {
        if (integrationDisposed) detach();
        else disconnectPlugins = detach;
      })
      .catch((error) => toast.error(String(error)));
    const running = new Map<string, boolean>();
    const observe = (session: ChatSession) => {
      const key = sessionKey(session.identity);
      const busy = isChatBusy(session.getSnapshot());
      if (running.get(key) === busy) return;
      running.set(key, busy);
      const location = chatService.getLocation(session);
      const store = useWorkspaceStore.getState();
      const workspace = store.workspaces.find((item) => item.path === location?.workspacePath);
      if (workspace) store.setChatLoading(workspace.id, session.identity.id, busy);
    };
    chatService.listSessions().forEach(observe);
    const detach = chatService.subscribe(observe);
    const detachSaved = chatService.onSaved(({ workspacePath, record }) =>
      useWorkspaceStore.getState().acceptChatRecord(workspacePath, record),
    );
    const refresh = () => {
      void chatService.refreshResources();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("hashchange", refresh);
    let disposed = false;
    let closing = false;
    let unlistenClose: (() => void) | undefined;
    if (isTauri())
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          event.preventDefault();
          if (closing) return;
          closing = true;
          try {
            const result = await chatService.closeAll();
            if (result.ok) await getCurrentWindow().destroy();
            else toast.error(`会话关闭失败，请重试：${result.error}`);
          } catch (error) {
            toast.error(`会话关闭失败，请重试：${String(error)}`);
          } finally {
            closing = false;
          }
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else unlistenClose = unlisten;
        })
        .catch((error) => toast.error(String(error)));
    return () => {
      integrationDisposed = true;
      disconnectPlugins?.();
      disposed = true;
      unlistenClose?.();
      detach();
      detachSaved();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("hashchange", refresh);
    };
  }, []);
  return (
    <DesktopChatEnvironment service={chatService} files={files}>
      {children}
    </DesktopChatEnvironment>
  );
}
