import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type {
  ExtensionAgentEvent,
  ExtensionSource,
} from "@isle/extension-host";
import {
  createExtensionHostClient,
  extensionHostMethods,
  type ExtensionHostCapability,
  type ExtensionHostMethods,
} from "@isle/extension-host/services";
import type { ExtensionState } from "../session/state.js";
import {
  serveWorker,
  type WorkerContext,
} from "../../security/execution/index.js";
import { createExtensionHost } from "@isle/extension-host/agent/registration";

let host: Awaited<ReturnType<typeof createExtensionHost>> | undefined;
let initialized = false;
const invocation = new AsyncLocalStorage<WorkerContext>();
const pending = new Map<
  string,
  { resolve(value: unknown): void; reject(error: Error): void }
>();
serveWorker({
  async execute(method, input, context) {
    if (method === "host_reply") {
      const reply = input as {
        id: string;
        result?: unknown;
        error?: { message: string; code: string };
      };
      const request = pending.get(reply.id);
      pending.delete(reply.id);
      if (reply.error)
        request?.reject(
          Object.assign(new Error(reply.error.message), {
            code: reply.error.code,
          }),
        );
      else request?.resolve(reply.result);
      return null;
    }
    if (method === "initialize") {
      if (initialized) throw new Error("插件进程已经初始化");
      initialized = true;
      const request = input as {
        sources: ExtensionSource[];
        workspacePath: string;
        hostCapabilities: string[];
      };
      for (const source of request.sources) {
        for (const capability of source.host?.required ?? []) {
          if (!request.hostCapabilities.includes(capability))
            throw new Error(`宿主未实现插件所需能力：${capability}`);
        }
      }
      host = await createExtensionHost(
        request.sources,
        request.workspacePath,
        (source) =>
          createExtensionHostClient(
            async <M extends ExtensionHostCapability>(
              method: M,
              input: ExtensionHostMethods[M]["input"],
            ) => {
              const call = invocation.getStore();
              if (!call) throw new Error("宿主能力只能在插件操作中调用");
              call.signal.throwIfAborted();
              const id = randomUUID();
              return new Promise<ExtensionHostMethods[M]["output"]>(
                (resolve, reject) => {
                  const cancel = () => {
                    pending.delete(id);
                    reject(new Error("插件操作已取消"));
                  };
                  const cleanup = () =>
                    call.signal.removeEventListener("abort", cancel);
                  pending.set(id, {
                    resolve(value) {
                      cleanup();
                      resolve(value as ExtensionHostMethods[M]["output"]);
                    },
                    reject(error) {
                      cleanup();
                      reject(error);
                    },
                  });
                  call.signal.addEventListener("abort", cancel, { once: true });
                  call.progress({ kind: "host_call", id, method, input });
                },
              );
            },
            (
              Object.keys(extensionHostMethods) as ExtensionHostCapability[]
            ).map((capability) => ({
              capability,
              status: [
                ...(source.host?.required ?? []),
                ...(source.host?.optional ?? []),
              ].includes(capability)
                ? request.hostCapabilities.includes(capability)
                  ? "available"
                  : "unsupported"
                : "denied",
            })),
          ),
      );
      return host.catalog;
    }
    if (
      host &&
      ["execute", "command", "event", "middleware"].includes(method)
    ) {
      const call = input as {
        name: string;
        input: unknown;
        callId: string;
        state: ExtensionState;
        extensionId: string;
        event: ExtensionAgentEvent;
      };
      const current = host;
      return invocation.run(context, () =>
        current.transact(call.state, async () => {
          if (method === "middleware")
            return current.intercept(call.name, call.input, context.signal);
          if (method === "command")
            return current.command(call.name, call.input, context.signal);
          if (method === "event")
            return current.notify(call.extensionId, call.event, context.signal);
          return current.execute(
            call.name,
            call.input,
            call.callId,
            context.signal,
            context.progress,
          );
        }),
      );
    }
    throw new Error("无效的插件进程请求");
  },
  async dispose() {
    for (const request of pending.values())
      request.reject(new Error("插件已停止"));
    pending.clear();
    await host?.dispose();
  },
});
