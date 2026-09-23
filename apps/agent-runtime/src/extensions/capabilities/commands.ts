import { randomUUID } from "node:crypto";
import type { ExtensionSource } from "@isle/extension-host";
import type { AgentRuntimeCallbacks } from "../../engines/drivers/native/agent/runtimes/types.js";
import type { ExtensionRuntime } from "../index.js";
import type { ExtensionSessionTarget, RuntimeExtensions } from "../types.js";

export function createRuntimeExtensions(
  getExtensionSources: () => readonly ExtensionSource[],
  callbacks: AgentRuntimeCallbacks,
  runtime: ExtensionRuntime,
): RuntimeExtensions {
  const open = (target: ExtensionSessionTarget, signal?: AbortSignal, taskId?: string) => {
    if (!target.sessionRootDir?.trim()) throw new Error("插件命令需要明确的 sessionRootDir");
    return runtime.open(
      getExtensionSources(),
      {
        ...target,
        runtimeMode: "agent",
        taskId: taskId ?? `extension-command-${randomUUID()}`,
        userMessage: "",
      },
      { callbacks, emit() {}, signal },
    );
  };
  return {
    async releaseSession(target) {
      if (!target.sessionRootDir?.trim()) throw new Error("释放插件会话需要明确的 sessionRootDir");
      await runtime.releaseSession(target.sessionRootDir);
    },
    async listCommands(target, options) {
      const resources = await open(target, options?.signal);
      try {
        return resources.catalog.commands;
      } finally {
        await resources.dispose();
      }
    },
    async executeCommand(input, options) {
      const resources = await open(input, options?.signal, input.taskId);
      try {
        return await resources.command(input.commandId, input.arguments ?? {}, {
          callId: randomUUID(),
          signal: options?.signal,
        });
      } finally {
        await resources.dispose();
      }
    },
  };
}
