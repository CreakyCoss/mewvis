import type { ExtensionAgentEvent } from "@isle/extension-host";
import type { ExtensionState } from "../session/state.js";
import type { ExtensionSource } from "@isle/extension-host";
import { serveWorker } from "../../security/execution/index.js";
import { createExtensionHost } from "@isle/extension-host/agent/registration";

let host: Awaited<ReturnType<typeof createExtensionHost>> | undefined;
let initialized = false;
serveWorker({
  async execute(method, input, context) {
    if (method === "initialize") {
      if (initialized) throw new Error("插件进程已经初始化");
      initialized = true;
      const request = input as { sources: ExtensionSource[]; workspacePath: string };
      host = await createExtensionHost(request.sources, request.workspacePath);
      return host.catalog;
    }
    if (host && ["execute", "command", "event", "middleware"].includes(method)) {
      const call = input as {
        name: string;
        input: unknown;
        callId: string;
        state: ExtensionState;
        extensionId: string;
        event: ExtensionAgentEvent;
      };
      const current = host;
      return current.transact(call.state, async () => {
        if (method === "middleware") return current.intercept(call.name, call.input, context.signal);
        if (method === "command") return current.command(call.name, call.input, context.signal);
        if (method === "event") return current.notify(call.extensionId, call.event, context.signal);
        return current.execute(call.name, call.input, call.callId, context.signal, context.progress);
      });
    }
    throw new Error("无效的插件进程请求");
  },
  async dispose() {
    await host?.dispose();
  },
});
