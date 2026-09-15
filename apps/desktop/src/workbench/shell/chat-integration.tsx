import { openSystemDialog } from "@/api/native";
import { confirmWorkspaceShare } from "./feedback";
import { invoke, listen, backendKind } from "@/transport";
import type { ApplicationChatRequest } from "@isle/app-sdk/chat";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { useCallback, useEffect, type PropsWithChildren } from "react";
import { DesktopChatEnvironment } from "@/chat/desktop/react";
import { isChatBusy, sessionKey, type ChatSession } from "@/chat/core";
import { useWorkspaceStore } from "@/workbench/pages/chats/workspace-store";
import { useWorkspaceFileStore } from "@/workbench/pages/chats/workspace-files";
import { applicationChatHost, chatService } from "./chat-service";

type WorkspaceInteraction = {
  requestId: string;
  applicationId: string;
  kind: string;
  path?: string;
  applications?: string[];
};
async function connectWorkspaceInteractions() {
  if (backendKind() !== "node") return () => {};
  const handled = new Set<string>();
  const pending = new Set<AbortController>();
  const unlisten = await listen<WorkspaceInteraction>("application-workspace:interaction", ({ payload }) => {
    if (handled.has(payload.requestId)) return;
    handled.add(payload.requestId);
    if (handled.size > 1024) handled.delete(handled.values().next().value!);
    // The server expires confirmations after 60 s; never leave a stale path chooser open.
    void (async () => {
      let value: string | null | boolean = null;
      const controller = new AbortController();
      pending.add(controller);
      const timer = setTimeout(() => controller.abort(), 55_000);
      try {
        if (payload.kind === "pick-directory") {
          const path = await openSystemDialog(
            { directory: true, title: `${payload.applicationId}：选择工作区目录` },
            controller.signal,
          );
          value = typeof path === "string" ? path : null;
        } else if (payload.kind === "confirm-share") {
          value = await confirmWorkspaceShare(
            "共享工作区",
            `应用 ${payload.applicationId} 请求共享工作区 ${payload.path}。已有应用：${payload.applications?.join("、") ?? ""}。是否允许？`,
            controller.signal,
          );
        }
      } finally {
        clearTimeout(timer);
        pending.delete(controller);
      }
      await invoke("answer_application_workspace_interaction", { input: { requestId: payload.requestId, value } });
    })().catch((error) => toast.error(String(error)));
  });
  return () => {
    unlisten();
    pending.forEach((controller) => controller.abort());
  };
}

type ApplicationChatBackendRequest = {
  connectionId: string;
  clientId: string;
  applicationId: string;
  tools: string[];
  id: string;
  request: ApplicationChatRequest;
};

let attachment: Promise<() => void> | undefined;
let consumers = 0;
async function connectBackendApplicationChat() {
  consumers++;
  const current = (attachment ??= (async () => {
    const connections = new Map<string, ReturnType<typeof applicationChatHost.connect>>();
    let active = true;
    const unlisteners: (() => void)[] = [];
    const dispose = () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
      connections.forEach((connection) => connection.dispose());
      connections.clear();
    };
    try {
      unlisteners.push(await connectWorkspaceInteractions());
      const post = (connectionId: string, message: unknown) =>
        invoke("post_application_chat", { input: { connectionId, message } });
      const unlisten = await listen<ApplicationChatBackendRequest>("application-chat:request", ({ payload }) => {
        if (!active) return;
        const { connectionId, clientId, applicationId, id, request, tools } = payload;
        const key = JSON.stringify([connectionId, applicationId, clientId]);
        let connection = connections.get(key);
        if (!connection) {
          connection = applicationChatHost.connect(applicationId, tools, (event) => {
            void post(connectionId, { type: "application-chat:snapshot", applicationId, event }).catch(() => {});
          });
          connections.set(key, connection);
        }
        void connection
          .request(request)
          .then(
            (result) => post(connectionId, { type: "application-chat:response", applicationId, id, result }),
            (error) =>
              post(connectionId, {
                type: "application-chat:response",
                applicationId,
                id,
                error: String(error?.message ?? error),
              }),
          )
          .catch(() => {}); // Process restarts invalidate its connection id, never the host session.
      });
      unlisteners.push(unlisten);
      const disconnect = await listen<string | { connectionId: string }>(
        "application-chat:disconnect",
        ({ payload }) => {
          for (const [key, connection] of connections)
            if (JSON.parse(key)[0] === (typeof payload === "string" ? payload : payload.connectionId)) {
              connection.dispose();
              connections.delete(key);
            }
        },
      );
      unlisteners.push(disconnect);
      const revoke = await listen<string | { applicationId: string }>("application-chat:revoke", ({ payload }) => {
        chatService.invalidateRecords();
        void applicationChatHost
          .revoke(typeof payload === "string" ? payload : payload.applicationId)
          .then((results) => {
            for (const result of results) if (!result.ok) toast.error(`应用会话关闭失败，可重试保存：${result.error}`);
          })
          .catch((error) => toast.error(String(error)))
          .finally(() => chatService.invalidateRecords());
      });
      unlisteners.push(revoke);
      return dispose;
    } catch (error) {
      dispose();
      throw error;
    }
  })());
  let detach: () => void;
  try {
    detach = await current;
  } catch (error) {
    consumers--;
    if (attachment === current) attachment = undefined;
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    consumers--;
    queueMicrotask(() => {
      if (!consumers && attachment === current) {
        attachment = undefined;
        detach();
      }
    });
  };
}

export function AppChatIntegration({ children }: PropsWithChildren) {
  const fileState = useWorkspaceFileStore();
  const files = useCallback(
    (session: ChatSession) =>
      chatService.getLocation(session)?.workspacePath === fileState.workspacePath ? fileState.files : [],
    [fileState.workspacePath, fileState.files],
  );
  useEffect(() => {
    let integrationDisposed = false;
    let disconnectApplications: (() => void) | undefined;
    void connectBackendApplicationChat()
      .then((detach) => {
        if (integrationDisposed) detach();
        else disconnectApplications = detach;
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
      disconnectApplications?.();
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
