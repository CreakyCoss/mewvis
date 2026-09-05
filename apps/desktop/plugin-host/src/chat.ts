import {
  createPluginChatClient,
  type PluginChatClient,
  type PluginChatEvent,
  type PluginChatRequest,
} from "@isle/plugin-sdk/chat";

/** Bidirectional stdio transport. Desktop owns execution even when the plugin has no UI. */
export function createNativePluginChat(send: (message: unknown) => void, tools: (pluginId: string) => string[]) {
  const clients = new Map<string, PluginChatClient>();
  const listeners = new Map<string, Set<(event: PluginChatEvent) => void>>();
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  let sequence = 0;
  return {
    client(pluginId: string) {
      let client = clients.get(pluginId);
      if (!client) {
        const clientId = String(++sequence);
        client = createPluginChatClient({
          request(request: PluginChatRequest) {
            const id = String(++sequence);
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error("桌面聊天宿主未响应"));
              }, 120_000);
              timer.unref?.();
              pending.set(id, { resolve, reject, timer });
              send({ type: "plugin-chat:request", pluginId, clientId, tools: tools(pluginId), id, request });
            });
          },
          subscribe(listener) {
            let set = listeners.get(pluginId);
            if (!set) {
              set = new Set();
              listeners.set(pluginId, set);
            }
            set.add(listener);
            return () => {
              set.delete(listener);
            };
          },
        });
        clients.set(pluginId, client);
      }
      return client;
    },
    receive(value: unknown) {
      if (!value || typeof value !== "object") return false;
      const message = value as {
        type?: string;
        pluginId?: string;
        id?: string;
        event?: PluginChatEvent;
        result?: unknown;
        error?: string;
      };
      if (message.type === "plugin-chat:snapshot" && message.event) {
        listeners.get(message.pluginId ?? "")?.forEach((listener) => listener(message.event!));
        return true;
      }
      if (message.type !== "plugin-chat:response") return false;
      const request = pending.get(message.id ?? "");
      if (request) {
        pending.delete(message.id!);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error));
        else request.resolve(message.result);
      }
      return true;
    },
    dispose() {
      clients.forEach((client) => client.dispose());
      clients.clear();
      listeners.clear();
      pending.forEach((request) => {
        clearTimeout(request.timer);
        request.reject(new Error("插件宿主已断开"));
      });
      pending.clear();
    },
  };
}
