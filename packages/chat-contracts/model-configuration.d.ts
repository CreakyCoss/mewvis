import type {
  RuntimeModelModality,
  RuntimeModelOperation,
} from "./model-capabilities.js";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonSchema = boolean | { [key: string]: JsonValue };
export type ModelProtocol =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-codex-responses"
  | "openai-responses"
  | "azure-openai-responses"
  | "google-generative-ai"
  | "openrouter"
  | "http-json";
export interface ModelConnection {
  apiKey?: string;
  apiEndpoint: string;
  apiFormat: ModelProtocol;
}
export interface ModelParameter {
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "object" | "array";
  default?: JsonValue;
  overridable: boolean;
  schema?: JsonSchema;
}
export interface ModelRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  headers: Record<string, string>;
  body?: JsonValue;
}
export interface ModelOutputRule {
  type: RuntimeModelModality;
  source: "url" | "base64" | "text" | "json";
  path: string;
  itemPath?: string;
  mimeType?: string;
}
export interface ModelResponse {
  mode: "direct" | "task";
  outputs: ModelOutputRule[];
  success?: { path: string; equals: JsonValue };
  errorPath?: string;
  task?: {
    idPath: string;
    request: ModelRequest;
    statusPath: string;
    successValues: JsonValue[];
    failureValues: JsonValue[];
    intervalSeconds: number;
  };
}
export interface ModelPurpose {
  type: RuntimeModelOperation;
  adapter: "native" | "http-json";
  /** Omitted connection fields inherit the Provider. */
  connection?: Partial<ModelConnection>;
  /** Omitted IDs use the model's top-level request ID. */
  modelId?: string;
  input: RuntimeModelModality[];
  output: RuntimeModelModality[];
  reasoning?: boolean;
  toolCalling?: boolean;
  inputSchema?: JsonSchema;
  parameters: ModelParameter[];
  request?: ModelRequest;
  response?: ModelResponse;
  /** A snapshot is saved with its source. Updating a preset never overwrites user edits. */
  preset?: { id: string; version: number };
}
export interface ModelConfiguration {
  version: 1;
  purposes: ModelPurpose[];
}
export interface ModelTemplateContext {
  apiEndpoint: string;
  model: { id: string };
  input: JsonValue;
  params: Record<string, JsonValue>;
  auth: { apiKey: string };
  task?: { id: string };
}
export declare const MODEL_PROTOCOLS: readonly ModelProtocol[];
export declare const MODEL_PARAMETER_TYPES: readonly ModelParameter["type"][];
export declare function createModelPurpose(
  type: RuntimeModelOperation,
  adapter?: ModelPurpose["adapter"],
): ModelPurpose;
export declare function getModelConfigurationError(value: unknown): string;
export declare function resolveModelConnection(
  purpose: ModelPurpose | undefined,
  provider: ModelConnection,
): ModelConnection;
export declare function resolveModelParameters(
  purpose: ModelPurpose,
  overrides?: Record<string, JsonValue>,
): Record<string, JsonValue>;
export declare function buildModelRequest(
  purpose: ModelPurpose,
  context: Omit<ModelTemplateContext, "params">,
  overrides?: Record<string, JsonValue>,
  phase?: "initial" | "result",
): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: JsonValue;
};
export declare function previewModelRequest(
  purpose: ModelPurpose,
  options: {
    modelId: string;
    apiEndpoint: string;
    input: JsonValue;
    overrides?: Record<string, JsonValue>;
    taskId?: string;
    phase?: "initial" | "result";
  },
): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: JsonValue;
};
export declare function readJsonPointer(
  value: unknown,
  pointer: string,
): unknown;
export declare function parseModelResponse(
  purpose: ModelPurpose,
  value: JsonValue,
  phase?: "initial" | "result",
): {
  status: "completed" | "pending" | "failed";
  taskId?: string;
  error?: string;
  outputs: {
    type: RuntimeModelModality;
    source: ModelOutputRule["source"];
    value: JsonValue;
    mimeType?: string;
  }[];
};
