import { invoke, isTauri } from "@tauri-apps/api/core";
import type { PluginDataResponse, PluginDataTransport } from "@isle/plugin-sdk/data";

/** The parent frame binds identity; the iframe never receives this connection token. */
export function createDesktopPluginDataTransport(pluginId: string): PluginDataTransport & { dispose(): void } {
  let connection: Promise<string> | undefined;
  let disposed = false;
  const unavailable = (): PluginDataResponse => ({
    ok: false,
    error: { code: "CAPABILITY_UNAVAILABLE", message: "当前环境未提供插件数据宿主" },
  });
  return {
    version: 1,
    async request(request) {
      if (disposed) return { ok: false, error: { code: "PERMISSION_DENIED", message: "插件数据连接已关闭" } };
      if (!isTauri()) return unavailable();
      connection ??= invoke<string>("connect_plugin_data", { pluginId }).catch((error) => {
        connection = undefined;
        throw error;
      });
      let token: string;
      try {
        token = await connection;
      } catch (error) {
        if (error && typeof error === "object" && "ok" in error && error.ok === false)
          return error as PluginDataResponse;
        throw error;
      }
      if (disposed) return { ok: false, error: { code: "PERMISSION_DENIED", message: "插件数据连接已关闭" } };
      return invoke<PluginDataResponse>("request_plugin_data", { connection: token, request });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void connection?.then((token) => invoke("disconnect_plugin_data", { connection: token })).catch(() => {});
    },
  };
}
