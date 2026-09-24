export interface ExtensionActivity {
  id: string;
  title: string;
  state: "running" | "completed" | "failed" | "cancelled";
  detail?: string;
  steps: Array<{
    id: string;
    title: string;
    state: "pending" | "running" | "completed" | "failed" | "cancelled";
  }>;
}
export interface ExtensionActivitySnapshot extends ExtensionActivity {
  updatedAt: number;
}
/** Plugin-facing host contracts. No transport, storage paths or Agent-native types. */
export interface ExtensionSessionSnapshot {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
  }>;
  runs: Array<{
    id: string;
    status: "running" | "done" | "error" | null;
    startedAt: number | null;
    endedAt: number | null;
  }>;
  truncated: boolean;
}
export interface ExtensionLedgerSnapshot {
  messages: Array<{
    id: string;
    role: string;
    text: string;
    timestamp: number;
    thinking?: string;
    tools?: string;
  }>;
  runs: Array<{
    id: string;
    status: "running" | "done" | "error" | null;
    startedAt: number | null;
    endedAt: number | null;
    messageIds: string[];
    instructionIds: string[];
    contextIds: string[];
  }>;
  instructions: Array<{ id: string; text: string; timestamp: number }>;
  contexts: Array<{ id: string; text: string; timestamp: number }>;
  summary: string | null;
  truncated: boolean;
}
export type ExtensionSummaryScope =
  { kind: "session" } | { kind: "run"; runId: string };
export interface ExtensionSummaryRequest {
  scope: ExtensionSummaryScope;
}
/** Ephemeral result. MUST NOT write to the ledger, messages or future Agent context. */
export interface ExtensionSummaryResult {
  text: string;
  generatedAt: number;
  truncated: boolean;
}
export interface ExtensionHostMethods {
  "configuration.read": {
    input: Record<string, never>;
    output: import("../shared.js").JsonObject;
  };
  "configuration.write": {
    input: { value: import("../shared.js").JsonObject };
    output: import("../shared.js").JsonObject;
  };
  "tasks.run": {
    input: { text: string; systemPrompt?: string };
    output: { text: string };
  };
  "activity.publish": { input: ExtensionActivity; output: null };
  "activity.read": {
    input: Record<string, never>;
    output: ExtensionActivitySnapshot | null;
  };
  "activity.cancel": { input: { id: string }; output: null };

  "session.read": {
    input: Record<string, never>;
    output: ExtensionSessionSnapshot;
  };
  "session.ledger.read": {
    input: Record<string, never>;
    output: ExtensionLedgerSnapshot;
  };
  "session.summarize": {
    input: ExtensionSummaryRequest;
    output: ExtensionSummaryResult;
  };
}
export type ExtensionHostCapability = keyof ExtensionHostMethods;
export interface ExtensionHostRequirements {
  required?: ExtensionHostCapability[];
  optional?: ExtensionHostCapability[];
}
export type ExtensionHostSupport = {
  capability: ExtensionHostCapability;
  status: "available" | "unsupported" | "denied";
};
export type ExtensionHostErrorCode =
  | "HOST_UNSUPPORTED"
  | "HOST_DENIED"
  | "HOST_INVALID_REQUEST"
  | "HOST_UNAVAILABLE"
  | "HOST_CANCELLED"
  | "HOST_FAILED";
export type ExtensionHostTransport = <M extends ExtensionHostCapability>(
  method: M,
  input: ExtensionHostMethods[M]["input"],
  options?: { signal?: AbortSignal },
) => Promise<ExtensionHostMethods[M]["output"]>;
export interface ExtensionHostServices {
  readonly configuration: {
    read(options?: {
      signal?: AbortSignal;
    }): Promise<import("../shared.js").JsonObject>;
    write(
      value: import("../shared.js").JsonObject,
      options?: { signal?: AbortSignal },
    ): Promise<import("../shared.js").JsonObject>;
  };
  readonly tasks: {
    run(
      input: { text: string; systemPrompt?: string },
      options?: { signal?: AbortSignal },
    ): Promise<{ text: string }>;
  };
  readonly activity: {
    publish(
      input: ExtensionActivity,
      options?: { signal?: AbortSignal },
    ): Promise<null>;
    read(options?: {
      signal?: AbortSignal;
    }): Promise<ExtensionActivitySnapshot | null>;
    cancel(id: string, options?: { signal?: AbortSignal }): Promise<null>;
  };

  readonly capabilities: readonly ExtensionHostSupport[];
  supports(capability: ExtensionHostCapability): boolean;
  readonly session: {
    read(options?: { signal?: AbortSignal }): Promise<ExtensionSessionSnapshot>;
    readonly ledger: {
      read(options?: {
        signal?: AbortSignal;
      }): Promise<ExtensionLedgerSnapshot>;
    };
    summarize(
      input: ExtensionSummaryRequest,
      options?: { signal?: AbortSignal },
    ): Promise<ExtensionSummaryResult>;
  };
}
export const extensionHostMethods: Readonly<
  Record<ExtensionHostCapability, { requestSchema: Record<string, unknown> }>
>;
export function createExtensionHostClient(
  transport: ExtensionHostTransport,
  capabilities: readonly ExtensionHostSupport[],
): ExtensionHostServices;
