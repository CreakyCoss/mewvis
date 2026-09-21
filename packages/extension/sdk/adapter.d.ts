import type {
  ExtensionAgentEvent,
  ExtensionCapability,
  ExtensionCommand,
  ExtensionSkill,
  ExtensionSource,
  ExtensionTool,
  ExtensionToolResult,
  JsonValue,
} from "./index.js";
import type { ExtensionMiddlewareType, ExtensionMiddlewareData, ExtensionMiddlewareOutcome } from "./middleware.js";

/** Serializable contributions; executable callbacks stay behind the host binding. */
export interface ExtensionCatalog {
  middleware: Array<{ id: string; extensionId: string; type: ExtensionMiddlewareType }>;
  tools: Array<{
    id: string;
    name: string;
    label: string;
    description: string;
    parameters: ExtensionTool["parameters"];
  }>;
  commands: Array<{
    id: string;
    description: string;
    parameters: ExtensionCommand["parameters"];
  }>;
  skills: Array<{
    id: string;
    description: string;
    content: ExtensionSkill["content"];
  }>;
  subscriptions: Array<{
    extensionId: string;
    events: ExtensionAgentEvent["type"][];
  }>;
}

/** Agent-independent host ports. Calls retain host validation, permissions and state transactions. */
export interface ExtensionBindings {
  readonly protocolVersion: 1;
  readonly catalog: ExtensionCatalog;
  execute(
    name: string,
    input: unknown,
    options: {
      callId: string;
      signal?: AbortSignal;
      progress?: (value: ExtensionToolResult) => void;
    },
  ): Promise<ExtensionToolResult>;
  command(id: string, input: unknown, options: { callId: string; signal?: AbortSignal }): Promise<JsonValue>;
  notify(event: ExtensionAgentEvent): Promise<void>;
  intercept<T extends ExtensionMiddlewareType>(
    type: T,
    data: ExtensionMiddlewareData[T],
    options?: { signal?: AbortSignal },
  ): Promise<ExtensionMiddlewareOutcome<T>>;
}

export type ExtensionMappingMode = "direct" | "simulate" | "ignore" | "noop" | "error";
export type ExtensionCapabilityMapping =
  { mode: "direct"; reason?: string } | { mode: "simulate" | "ignore" | "noop" | "error"; reason: string };
export interface ExtensionAdapterContext {
  taskId: string;
  runtimeId: string;
  signal?: AbortSignal;
}
export interface ExtensionAdapter<TNativePlugin> {
  readonly id: string;
  readonly protocolVersion: 1;
  readonly capabilities: Readonly<Partial<Record<ExtensionCapability, ExtensionCapabilityMapping>>>;
  /** Returns a native plugin/factory to register through the target Agent's own API. */
  adapt(bindings: ExtensionBindings, context: ExtensionAdapterContext): TNativePlugin;
}
export interface ExtensionAdaptationReport {
  adapterId: string;
  protocolVersion: 1;
  degraded: boolean;
  mappings: Array<{
    extensionId: string;
    capability: ExtensionCapability;
    mode: ExtensionMappingMode;
    reason?: string;
  }>;
}
export function defineExtensionAdapter<TNativePlugin>(
  adapter: ExtensionAdapter<TNativePlugin>,
): ExtensionAdapter<TNativePlugin>;
/** Negotiates declared requirements. Missing mappings default to error. No plugin code runs here. */
export function resolveExtensionAdaptation(
  adapter: ExtensionAdapter<unknown>,
  sources: readonly ExtensionSource[],
): ExtensionAdaptationReport;
