import {
  createApplicationFileClient,
  type ApplicationFileRequest,
  type ApplicationFileResponse,
} from "@mewvis/app-sdk/files";
import { randomUUID } from "node:crypto";

export function createNativeApplicationFiles(send: (message: unknown) => void) {
  let closed = false;
  const pending = new Map<
    string,
    {
      resolve(value: ApplicationFileResponse): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  return {
    client(connection?: string | null) {
      return createApplicationFileClient({
        version: 1,
        async request(
          request: ApplicationFileRequest,
        ): Promise<ApplicationFileResponse> {
          if (closed || !connection)
            return {
              ok: false,
              error: {
                code: "CAPABILITY_UNAVAILABLE",
                message: "应用未声明 workspace-files 或文件连接不可用",
              },
            };
          if (pending.size >= 64)
            return {
              ok: false,
              error: { code: "LIMIT_EXCEEDED", message: "文件请求过多" },
            };
          const id = randomUUID();
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error("文件请求超时，请重新读取确认结果"));
            }, 30_000);
            timer.unref?.();
            pending.set(id, { resolve, reject, timer });
            try {
              send({
                type: "application-files:request",
                id,
                connection,
                request,
              });
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
      if (
        !value ||
        typeof value !== "object" ||
        !("type" in value) ||
        value.type !== "application-files:response"
      )
        return false;
      const message = value as {
        id?: string;
        response?: ApplicationFileResponse;
      };
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
        call.reject(new Error("文件连接已关闭"));
      }
      pending.clear();
    },
  };
}
