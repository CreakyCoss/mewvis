import type { ExtensionAgentEvent, ExtensionBindings, ExtensionCatalog, JsonValue } from "@mewvis/extension-host";
import type { AgentAccess, AgentPermissions } from "../engines/protocol/wire.js";

export type ExtensionSessionTarget = {
  workspacePath: string;
  sessionRootDir: string;
  permissions?: AgentPermissions;
  agentAccess?: AgentAccess;
};
export type ExtensionCommandInput = ExtensionSessionTarget & {
  commandId: string;
  arguments?: unknown;
  taskId?: string;
};
export type ExtensionDiagnostic = {
  extensionId: string;
  taskId: string;
  eventType: string;
  message: string;
};

/** SDK/stdio command surface. Commands are explicit actions, never parsed from model output. */
export interface RuntimeExtensions {
  releaseSession(target: ExtensionSessionTarget): Promise<void>;
  listCommands(
    target: ExtensionSessionTarget,
    options?: { signal?: AbortSignal },
  ): Promise<ExtensionCatalog["commands"]>;
  executeCommand(input: ExtensionCommandInput, options?: { signal?: AbortSignal }): Promise<JsonValue>;
}

/** A borrowed operation; always dispose it after the Agent or maintenance operation returns. */
export interface ExtensionOperation extends ExtensionBindings {
  /** Deliver the run terminal event once, recovering a failed worker when possible. Does not release the operation. */
  finish(event: Extract<ExtensionAgentEvent, { type: "run_finished" }>): Promise<void>;
  dispose(): Promise<void>;
}
