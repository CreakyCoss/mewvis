import { toast } from "sonner";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PluginChatRequest } from "@isle/plugin-sdk/chat";
import { pluginChatHost } from "./chat-service";
import { chatService } from "./chat-service";

type Request = {
  connectionId: string;
  clientId: string;
  pluginId: string;
  tools: string[];
  id: string;
  request: PluginChatRequest;
};
/** Native and iframe transports share the same host owner and authorization rules. */
async function attachNativePluginChat() {
  if (!isTauri()) return () => {};
  const connections = new Map<string, ReturnType<typeof pluginChatHost.connect>>();
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
      invoke("post_plugin_chat", { input: { connectionId, message } });
    const unlisten = await listen<Request>("plugin-chat:request", ({ payload }) => {
      if (!active) return;
      const { connectionId, clientId, pluginId, id, request, tools } = payload;
      const key = JSON.stringify([connectionId, pluginId, clientId]);
      let connection = connections.get(key);
      if (!connection) {
        connection = pluginChatHost.connect(pluginId, tools, (event) => {
          void post(connectionId, { type: "plugin-chat:snapshot", pluginId, event }).catch(() => {});
        });
        connections.set(key, connection);
      }
      void connection
        .request(request)
        .then(
          (result) => post(connectionId, { type: "plugin-chat:response", pluginId, id, result }),
          (error) =>
            post(connectionId, { type: "plugin-chat:response", pluginId, id, error: String(error?.message ?? error) }),
        )
        .catch(() => {}); // Process restarts invalidate its connection id, never the host session.
    });
    unlisteners.push(unlisten);
    const disconnect = await listen<string>("plugin-chat:disconnect", ({ payload }) => {
      for (const [key, connection] of connections)
        if (JSON.parse(key)[0] === payload) {
          connection.dispose();
          connections.delete(key);
        }
    });
    unlisteners.push(disconnect);
    const revoke = await listen<string>("plugin-chat:revoke", ({ payload }) => {
      chatService.invalidateRecords();
      void pluginChatHost
        .revoke(payload)
        .then((results) => {
          for (const result of results) if (!result.ok) toast.error(`插件会话关闭失败，可重试保存：${result.error}`);
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
export async function connectNativePluginChat() {
  consumers++;
  const current = (attachment ??= attachNativePluginChat());
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
