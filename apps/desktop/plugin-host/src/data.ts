import { createPluginDataClient, type PluginDataRequest, type PluginDataResponse } from "@isle/plugin-sdk/data";
import { randomUUID } from "node:crypto";

/** Reverse calls on a host-owned pipe. Only an opaque, host-issued binding crosses this channel. */
export function createNativePluginData(send: (message: unknown) => void) {
  let sequence = 0;
  let closed = false;
  const generation = randomUUID();
  const pending = new Map<
    string,
    { resolve(value: PluginDataResponse): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  return {
    client(connection?: string | null) {
      return createPluginDataClient({
        version: 1,
        async request(request: PluginDataRequest): Promise<PluginDataResponse> {
          if (closed || !connection)
            return {
              ok: false,
              error: { code: "PERMISSION_DENIED", message: "插件未声明数据 SDK 权限或数据连接不可用" },
            };
          if (pending.size >= 64) return { ok: false, error: { code: "INTERNAL_ERROR", message: "插件数据请求过多" } };
          const id = `${generation}:${++sequence}`;
          return new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => {
                pending.delete(id);
                reject(new Error("插件数据请求超时，请读取确认结果"));
              },
              request.method === "workspaces.create" ? 75_000 : 30_000,
            );
            timer.unref?.();
            pending.set(id, { resolve, reject, timer });
            try {
              send({ type: "plugin-data:request", id, connection, request });
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
      if (!value || typeof value !== "object" || !("type" in value) || value.type !== "plugin-data:response")
        return false;
      const message = value as { id?: string; response?: PluginDataResponse };
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
        call.reject(new Error("插件数据连接已关闭"));
      }
      pending.clear();
    },
  };
}
