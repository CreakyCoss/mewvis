import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ApplicationDataResponse, ApplicationDataTransport } from "@isle/app-sdk/data";

/** The parent frame binds identity; the iframe never receives this connection token. */
export function createDesktopApplicationDataTransport(applicationId: string): ApplicationDataTransport & { dispose(): void } {
  let connection: Promise<string> | undefined;
  let disposed = false;
  const unavailable = (): ApplicationDataResponse => ({
    ok: false,
    error: { code: "CAPABILITY_UNAVAILABLE", message: "当前环境未提供应用数据宿主" },
  });
  return {
    version: 1,
    async request(request) {
      if (disposed) return { ok: false, error: { code: "PERMISSION_DENIED", message: "应用数据连接已关闭" } };
      if (!isTauri()) return unavailable();
      connection ??= invoke<string>("connect_application_data", { applicationId }).catch((error) => {
        connection = undefined;
        throw error;
      });
      let token: string;
      try {
        token = await connection;
      } catch (error) {
        if (error && typeof error === "object" && "ok" in error && error.ok === false)
          return error as ApplicationDataResponse;
        throw error;
      }
      if (disposed) return { ok: false, error: { code: "PERMISSION_DENIED", message: "应用数据连接已关闭" } };
      return invoke<ApplicationDataResponse>("request_application_data", { connection: token, request });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      void connection?.then((token) => invoke("disconnect_application_data", { connection: token })).catch(() => {});
    },
  };
}
