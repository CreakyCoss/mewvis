import { invoke, listen } from "@/transport";
import { platform } from "@/platform";
import type { ApplicationMediaTransport, ApplicationMediaResponse } from "@mewvis/app-sdk/media";
import type {
  ApplicationFileTransport,
  ApplicationFileResponse,
  ApplicationFilePreviewResource,
} from "@mewvis/app-sdk/files";

/** Decorates only the server-created single-file capability, never a user-supplied URL. */
async function browserResource(value: ApplicationFilePreviewResource, includeRuntime = true): Promise<FilePreview> {
  if (!/^file-previews\/[0-9a-f-]+\/[a-f0-9]{64}$/.test(value.resourcePath)) throw new Error("预览资源地址无效");
  const backend = await platform.getBackendConnection();
  return {
    ...value,
    resourceUrl: `${backend?.url ?? location.origin}/api/${value.resourcePath}`,
    ...(includeRuntime && value.kind === "pdf"
      ? {
          workerSource: (await import("pdfjs-dist/build/pdf.worker.min.mjs?raw")).default,
          pdfSource: (await import("pdfjs-dist/build/pdf.min.mjs?raw")).default,
        }
      : {}),
  };
}
export function createBackendApplicationFileTransport(
  applicationId?: string,
): ApplicationFileTransport & { media: ApplicationMediaTransport; dispose(): void } {
  let connection: Promise<string> | undefined,
    disposed = false;
  const owned = new Set<string>(),
    listeners = new Set<(event: { id: string }) => void>();
  let unlisten: (() => void) | undefined;
  const token = async () => {
    if (disposed) throw new Error("文件连接已关闭");
    connection ??= (
      applicationId
        ? invoke<string>("connect_application_files", { applicationId })
        : invoke<string>("connect_host_files")
    ).catch((error) => {
      connection = undefined;
      throw error;
    });
    const value = await connection;
    if (disposed) throw new Error("文件连接已关闭");
    return value;
  };
  void listen<{ id: string }>("application-file-preview:close", ({ payload }) => {
    if (owned.delete(payload.id)) for (const listener of listeners) listener(payload);
  })
    .then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    })
    .catch(() => {});
  return {
    version: 1,
    media: {
      version: 1,
      request: async (request) =>
        invoke<ApplicationMediaResponse>("request_application_media", { connection: await token(), request }),
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async request(request) {
      if (disposed) return { ok: false, error: { code: "PERMISSION_DENIED", message: "文件连接已关闭" } };
      const connectionToken = await token();
      if (disposed) return { ok: false, error: { code: "PERMISSION_DENIED", message: "文件连接已关闭" } };
      const response = await invoke<ApplicationFileResponse>("request_application_files", {
        connection: connectionToken,
        request,
      });
      if (response.ok && ["preview.create", "preview.describe", "preview.openDialog"].includes(request.method)) {
        const resource = response.value as ApplicationFilePreviewResource;
        owned.add(resource.id);
        return { ok: true, value: await browserResource(resource, request.method !== "preview.openDialog") };
      }
      return response;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unlisten?.();
      listeners.clear();
      owned.clear();
      void connection?.then((token) => invoke("disconnect_application_files", { connection: token })).catch(() => {});
    },
  };
}
export type FilePreview = ApplicationFilePreviewResource & { resourceUrl: string };
export const getFilePreview = async (id: string) =>
  browserResource(await invoke<ApplicationFilePreviewResource>("get_file_preview", { input: { id } }));
export const closeFilePreview = (id: string) => invoke<void>("close_file_preview", { input: { id } });
