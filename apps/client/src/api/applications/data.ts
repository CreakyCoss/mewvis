import { invoke } from "@/transport";
import type { ApplicationDataResponse, ApplicationDataTransport } from "@mewvis/app-sdk/data";

/** The parent frame binds identity; the iframe never receives this connection token. */
export function createBackendApplicationDataTransport(
  applicationId: string,
): ApplicationDataTransport & { dispose(): void } {
  let connection: Promise<string> | undefined;
  let disposed = false;
  return {
    version: 1,
    async request(request) {
      if (disposed) return { ok: false, error: { code: "PERMISSION_DENIED", message: "应用数据连接已关闭" } };

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
