import { createApplicationDataClient, type ApplicationDataRequest, type ApplicationDataResponse } from "@isle/app-sdk/data";
import { randomUUID } from "node:crypto";

/** Reverse calls on a host-owned pipe. Only an opaque, host-issued binding crosses this channel. */
export function createNativeApplicationData(send: (message: unknown) => void) {
  let sequence = 0;
  let closed = false;
  const generation = randomUUID();
  const pending = new Map<
    string,
    { resolve(value: ApplicationDataResponse): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  return {
    client(connection?: string | null) {
      return createApplicationDataClient({
        version: 1,
        async request(request: ApplicationDataRequest): Promise<ApplicationDataResponse> {
          if (closed || !connection)
            return {
              ok: false,
              error: { code: "PERMISSION_DENIED", message: "应用未声明数据 SDK 权限或数据连接不可用" },
            };
          if (pending.size >= 64) return { ok: false, error: { code: "INTERNAL_ERROR", message: "应用数据请求过多" } };
          const id = `${generation}:${++sequence}`;
          return new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => {
                pending.delete(id);
                reject(new Error("应用数据请求超时，请读取确认结果"));
              },
              ["workspaces.create", "workspaces.selectDirectory"].includes(request.method) ? 75_000 : 30_000,
            );
            timer.unref?.();
            pending.set(id, { resolve, reject, timer });
            try {
              send({ type: "application-data:request", id, connection, request });
            } catch (error) {
              clearTimeout(timer);
              pending.delete(id);
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          });
        },
      });
    },
    receive(value: unknown) {
      if (!value || typeof value !== "object" || !("type" in value) || value.type !== "application-data:response")
        return false;
      const message = value as { id?: string; response?: ApplicationDataResponse };
      const call = pending.get(message.id ?? "");
      if (call) {
        pending.delete(message.id!);
        clearTimeout(call.timer);
        call.resolve(message.response!);
      }
      return true;
    },
    dispose() {
      closed = true;
      for (const call of pending.values()) {
        clearTimeout(call.timer);
        call.reject(new Error("应用数据连接已关闭"));
      }
      pending.clear();
    },
  };
}
