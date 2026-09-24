import type { JsonObject, JsonValue } from "../shared.js";
import type { ExtensionCapability } from "./index.js";
import type { ExtensionAgentEvent } from "./events.js";
import type {
  ExtensionTool,
  ExtensionToolResult,
  ExtensionSkill,
  ExtensionCommand,
} from "./resources.js";
import type {
  ExtensionMiddlewareType,
  ExtensionMiddlewareData,
  ExtensionMiddlewareOutcome,
} from "./middleware.js";

/** Host-selected, prebuilt local ESM entry. Never supplied by an agent prompt. */
export interface ExtensionSource {
  id: string;
  entry: string;
  host?: import("../services/contracts.js").ExtensionHostRequirements;
  config?: JsonObject;
  /** Package contributions must stay within this declaration. Omission gives a host-provided direct source access to all Agent capabilities. */
  capabilities?: readonly ExtensionCapability[];
  /** Host-reviewed risk overrides, keyed by local tool name; omitted means unknown. */
  toolRisks?: Readonly<Record<string, "low" | "medium" | "high">>;
  commandRisks?: Readonly<Record<string, "low" | "medium" | "high">>;
}

/** Serializable contributions; executable callbacks stay behind the host binding. */
export interface ExtensionCatalog {
  middleware: Array<{
    id: string;
    extensionId: string;
    type: ExtensionMiddlewareType;
  }>;
  tools: Array<{
    id: string;
    name: string;
    label: string;
    description: string;
    parameters: ExtensionTool["parameters"];
  }>;
  commands: Array<{
    label?: string;
    inputMode?: "text";
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
  /** Host checkpoint wait state; adapters can suspend idle watchdogs without changing Agent APIs. */
  readonly suspension?: {
    readonly active: boolean;
    subscribe(listener: () => void): () => void;
  };
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
  command(
    id: string,
    input: unknown,
    options: { callId: string; signal?: AbortSignal },
  ): Promise<JsonValue>;
  notify(event: ExtensionAgentEvent): Promise<void>;
  intercept<T extends ExtensionMiddlewareType>(
    type: T,
    data: ExtensionMiddlewareData[T],
    options?: { signal?: AbortSignal },
  ): Promise<ExtensionMiddlewareOutcome<T>>;
}
