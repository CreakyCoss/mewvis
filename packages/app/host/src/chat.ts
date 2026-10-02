import {
  createApplicationChatClient,
  type ApplicationChatClient,
  type ApplicationChatEvent,
  type ApplicationChatRequest,
} from "@mewvis/app-sdk/chat";

/** Bidirectional stdio transport. Desktop owns execution even when the application has no UI. */
export function createNativeApplicationChat(send: (message: unknown) => void, tools: (applicationId: string) => string[]) {
  const clients = new Map<string, ApplicationChatClient>();
  const listeners = new Map<string, Set<(event: ApplicationChatEvent) => void>>();
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  let sequence = 0;
  return {
    client(applicationId: string) {
      let client = clients.get(applicationId);
      if (!client) {
        const clientId = String(++sequence);
        client = createApplicationChatClient({
          request(request: ApplicationChatRequest) {
            const id = String(++sequence);
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error("桌面聊天宿主未响应"));
              }, 120_000);
              timer.unref?.();
              pending.set(id, { resolve, reject, timer });
              send({ type: "application-chat:request", applicationId, clientId, tools: tools(applicationId), id, request });
            });
          },
          subscribe(listener) {
            let set = listeners.get(applicationId);
            if (!set) {
              set = new Set();
              listeners.set(applicationId, set);
            }
            set.add(listener);
            return () => {
              set.delete(listener);
            };
          },
        });
        clients.set(applicationId, client);
      }
      return client;
    },
    receive(value: unknown) {
      if (!value || typeof value !== "object") return false;
      const message = value as {
        type?: string;
        applicationId?: string;
        id?: string;
        event?: ApplicationChatEvent;
        result?: unknown;
        error?: string;
      };
      if (message.type === "application-chat:snapshot" && message.event) {
        listeners.get(message.applicationId ?? "")?.forEach((listener) => listener(message.event!));
        return true;
      }
      if (message.type !== "application-chat:response") return false;
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
        request.reject(new Error("应用宿主已断开"));
      });
      pending.clear();
    },
  };
}
