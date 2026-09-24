import type { JsonObject } from "../shared.js";
import type {
  ExtensionTool,
  ExtensionSkill,
  ExtensionCommand,
} from "./resources.js";
import type { ExtensionSessionState } from "./session.js";
import type { ExtensionAgentEvent } from "./events.js";
import type {
  ExtensionMiddlewareType,
  ExtensionMiddlewareHandler,
} from "./middleware.js";

/** Agent module: tools, skills, commands, state, observation events and middleware. */
export interface AgentModuleManifest {
  entry: string;
  capabilities: ExtensionCapability[];
}

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

export interface ExtensionContext {
  readonly host: import("../host/services.js").ExtensionHostServices;
  workspacePath: string;
  /** Frozen instance snapshot; a host configuration change takes effect on a replacement instance. */
  readonly config: Readonly<JsonObject>;
  session: ExtensionSessionState;
  /** Register an implementation of a standard capability; consumers never address plugin IDs. */
  provide<M extends import("../host/services.js").ExtensionProvidedCapability>(
    method: M,
    handler: (input: import("../host/services.js").ExtensionHostMethods[M]["input"], context: { signal: AbortSignal }) => Promise<import("../host/services.js").ExtensionHostMethods[M]["output"]>,
  ): void;
  registerTool(tool: ExtensionTool): void;
  registerSkill(skill: ExtensionSkill): void;
  registerCommand(command: ExtensionCommand): void;
  /** Ordered middleware. Explicit continue/replace/block; errors stop the affected run. */
  use<T extends ExtensionMiddlewareType>(
    type: T,
    handler: ExtensionMiddlewareHandler<T>,
  ): void;
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

export function defineExtension(
  extension: ExtensionDefinition,
): ExtensionDefinition;
export function extensionToolName(
  extensionId: string,
  toolName: string,
): string;

export * from "./resources.js";
export * from "./events.js";
export * from "./middleware.js";
export * from "./session.js";
