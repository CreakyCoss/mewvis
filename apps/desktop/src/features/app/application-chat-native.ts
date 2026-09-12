import { toast } from "sonner";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ApplicationChatRequest } from "@isle/app-sdk/chat";
import { applicationChatHost } from "./chat-service";
import { chatService } from "./chat-service";

type Request = {
  connectionId: string;
  clientId: string;
  applicationId: string;
  tools: string[];
  id: string;
  request: ApplicationChatRequest;
};
/** Native and iframe transports share the same host owner and authorization rules. */
async function attachNativeApplicationChat() {
  if (!isTauri()) return () => {};
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
    const post = (connectionId: string, message: unknown) =>
      invoke("post_application_chat", { input: { connectionId, message } });
    const unlisten = await listen<Request>("application-chat:request", ({ payload }) => {
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
            post(connectionId, { type: "application-chat:response", applicationId, id, error: String(error?.message ?? error) }),
        )
        .catch(() => {}); // Process restarts invalidate its connection id, never the host session.
    });
    unlisteners.push(unlisten);
    const disconnect = await listen<string>("application-chat:disconnect", ({ payload }) => {
      for (const [key, connection] of connections)
        if (JSON.parse(key)[0] === payload) {
          connection.dispose();
          connections.delete(key);
        }
    });
    unlisteners.push(disconnect);
    const revoke = await listen<string>("application-chat:revoke", ({ payload }) => {
      chatService.invalidateRecords();
      void applicationChatHost
        .revoke(payload)
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
}

let attachment: Promise<() => void> | undefined;
let consumers = 0;
export async function connectNativeApplicationChat() {
  consumers++;
  const current = (attachment ??= attachNativeApplicationChat());
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
