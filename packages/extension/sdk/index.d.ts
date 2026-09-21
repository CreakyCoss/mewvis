export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

import type { ExtensionMiddlewareType, ExtensionMiddlewareHandler } from "./middleware.js";
import type { ExtensionAgentEvent } from "./events.js";
export type ExtensionCapability =
  | "tools"
  | "skills"
  | "commands"
  | "session.state"
  | "events.run"
  | "events.tool"
  | "events.turn"
  | "events.message"
  | "events.session"
  | `middleware.${ExtensionMiddlewareType}`;
export const extensionCapabilities: readonly [
  "tools",
  "skills",
  "commands",
  "session.state",
  "events.run",
  "events.tool",
  "events.turn",
  "events.message",
  "events.session",
  "middleware.input",
  "middleware.system_prompt",
  "middleware.context",
  "middleware.tool_call",
  "middleware.tool_result",
  "middleware.session_compact",
];

export interface ExtensionManifest {
  schemaVersion: 1;
  id: string;
  apiVersion: 1;
  entry: string;
  capabilities: ExtensionCapability[];
  configuration?: { schema: JsonObject; defaults?: JsonObject };
}

export interface ExtensionToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: JsonValue;
}

export interface ExtensionTool {
  name: string;
  label: string;
  description: string;
  parameters: JsonObject;
  execute(
    input: JsonObject,
    context: {
      callId: string;
      signal: AbortSignal;
      progress(result: ExtensionToolResult): void;
    },
  ): Promise<ExtensionToolResult>;
}

export interface ExtensionSkill {
  name: string;
  description: string;
  content: string;
}

export interface ExtensionCommand {
  name: string;
  description: string;
  parameters: JsonObject;
  execute(input: JsonObject, context: { signal: AbortSignal }): Promise<JsonValue>;
}

/** Valid inside tools, commands, observers and middleware. Commits when the handler and result validation succeed. */
export interface ExtensionSessionState {
  get(key: string): JsonValue | undefined;
  set(key: string, value: JsonValue): void;
  delete(key: string): void;
}

export interface ExtensionContext {
  workspacePath: string;
  /** Frozen instance snapshot; a host configuration change takes effect on a replacement instance. */
  readonly config: Readonly<JsonObject>;
  session: ExtensionSessionState;
  registerTool(tool: ExtensionTool): void;
  registerSkill(skill: ExtensionSkill): void;
  registerCommand(command: ExtensionCommand): void;
  /** Ordered middleware. Explicit continue/replace/block; errors stop the affected run. */
  use<T extends ExtensionMiddlewareType>(type: T, handler: ExtensionMiddlewareHandler<T>): void;
  on<T extends ExtensionAgentEvent["type"]>(
    type: T,
    handler: (
      event: Extract<ExtensionAgentEvent, { type: T }>,
      context: { signal: AbortSignal },
    ) => void | Promise<void>,
  ): void;
  own(dispose: () => void | Promise<void>): void;
  /** Once per instance, before its first operation. Memory may survive multiple runs in a live session. */
  onActivate(callback: () => void | Promise<void>): void;
}

/** Setup is synchronous; use onActivate for asynchronous initialization. */
export interface ExtensionDefinition {
  id: string;
  apiVersion: 1;
  setup(context: ExtensionContext): void;
}

/** Host-selected, prebuilt local ESM entry. Never supplied by an agent prompt. */
export interface ExtensionSource {
  id: string;
  entry: string;
  config?: JsonObject;
  /** Package contributions must stay within this declaration. Omitted for legacy direct sources. */
  capabilities?: readonly ExtensionCapability[];
  /** Host-reviewed risk overrides, keyed by local tool name; omitted means unknown. */
  toolRisks?: Readonly<Record<string, "low" | "medium" | "high">>;
  commandRisks?: Readonly<Record<string, "low" | "medium" | "high">>;
}

export function defineExtension(extension: ExtensionDefinition): ExtensionDefinition;
export function extensionToolName(extensionId: string, toolName: string): string;

export * from "./adapter.js";
export * from "./middleware.js";
export * from "./events.js";
export * from "./session.js";
