import type { ExtensionSource } from "@isle/extension-sdk";
import type {
  AgentRunCommand,
  AgentRuntimeContext,
  AgentRuntimeCallbacks,
} from "../engines/drivers/native/agent/runtimes/types.js";
import type { ExtensionOperation, RuntimeExtensions } from "./types.js";
import { createExtensionRunResources } from "./execution/operation.js";
import { ExtensionSessionPool } from "./session/pool.js";
import { createExtensionStateStore } from "./session/state.js";
import { snapshotExtensionSources } from "./sources.js";
import { createRuntimeExtensions } from "./capabilities/commands.js";

export type {
  ExtensionOperation,
  RuntimeExtensions,
  ExtensionCommandInput,
  ExtensionSessionTarget,
  ExtensionDiagnostic,
} from "./types.js";

/** Host integration boundary. Pool keys, workers, state files and recovery stay private. */
export interface ExtensionRuntime {
  readonly signal: AbortSignal;
  snapshotSources(sources: readonly ExtensionSource[]): readonly ExtensionSource[];
  bindCommands(
    getExtensionSources: () => readonly ExtensionSource[],
    callbacks: AgentRuntimeCallbacks,
  ): RuntimeExtensions;
  open(
    sources: readonly ExtensionSource[],
    command: AgentRunCommand,
    context: AgentRuntimeContext,
  ): Promise<ExtensionOperation>;
  /** Wait for pending work and release memory, preserving persisted plugin state. */
  releaseSession(sessionRootDir: string): Promise<void>;
  dispose(): Promise<void>;
}

export function createExtensionRuntime(): ExtensionRuntime {
  const sessions = new ExtensionSessionPool();
  const runtime: ExtensionRuntime = {
    get signal() {
      return sessions.signal;
    },
    snapshotSources: snapshotExtensionSources,
    bindCommands(getExtensionSources, callbacks) {
      return createRuntimeExtensions(getExtensionSources, callbacks, runtime);
    },
    async open(sources, command, context) {
      const resources = await createExtensionRunResources(sources, command, context, sessions);
      let finished: Promise<void> | undefined;
      return {
        protocolVersion: resources.protocolVersion,
        catalog: resources.catalog,
        execute: resources.execute,
        command: resources.command,
        intercept: resources.intercept,
        notify: resources.notify,
        dispose: resources.dispose,
        finish(event) {
          return (finished ??= (async () => {
            if (resources.available || !command.sessionRootDir || !sources.length || sessions.signal.aborted) {
              await resources.notify(event);
              return;
            }
            // Keep the original reservation until terminal delivery finishes; never replay execution.
            try {
              await resources.invalidate();
              const recovery = await createExtensionRunResources(sources, command, {
                ...context,
                signal: sessions.signal,
              });
              try {
                await recovery.notify(event);
              } finally {
                await recovery.dispose();
              }
            } catch (error) {
              if (!sessions.signal.aborted) console.error("Extension terminal observer could not restart", error);
            }
          })());
        },
      };
    },
    async releaseSession(sessionRootDir) {
      if (!sessionRootDir?.trim()) throw new Error("释放插件会话需要明确的 sessionRootDir");
      const state = await createExtensionStateStore(sessionRootDir);
      await sessions.releaseSession(state.directory!);
    },
    dispose: () => sessions.dispose(),
  };
  return runtime;
}
