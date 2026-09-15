import { Ajv, type ErrorObject } from "ajv";
import openRpcDocumentJson from "../../protocol/v1/openrpc.json" with { type: "json" };
import eventSchemaJson from "../../protocol/v1/schema/event.schema.json" with { type: "json" };
import modelSchemaJson from "../../protocol/v1/schema/model.schema.json" with { type: "json" };
import permissionsSchemaJson from "../../protocol/v1/schema/permissions.schema.json" with { type: "json" };
import accessSchemaJson from "../../protocol/v1/schema/access.schema.json" with { type: "json" };
import notificationSchemaJson from "../../protocol/v1/schema/notification.schema.json" with { type: "json" };
import requestSchemaJson from "../../protocol/v1/schema/request.schema.json" with { type: "json" };
import responseSchemaJson from "../../protocol/v1/schema/response.schema.json" with { type: "json" };
import resultSchemaJson from "../../protocol/v1/schema/result.schema.json" with { type: "json" };
import {
  agentRuntimeJsonRpcMethods,
  agentRuntimeProtocolVersion,
  type IsleAgentRuntimeJSONRPCNotification as JsonRpcNotification,
  type IsleAgentRuntimeJSONRPCRequest as JsonRpcRequest,
  type IsleAgentRuntimeJSONRPCResponse as JsonRpcResponse,
} from "../engines/protocol/wire.js";
import type { AgentRuntimeCommand } from "../engines/protocol/index.js";

export type JsonRpcId = NonNullable<JsonRpcResponse["id"]>;
export type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse };
export { agentRuntimeJsonRpcMethods, agentRuntimeProtocolVersion };

type ParamsMode = "flat" | "input";

type OpenRpcMethod = {
  name: string;
  "x-isle-command"?: {
    type: string;
    paramsMode: ParamsMode;
  };
  "x-isle-params-schema"?: string;
};

type OpenRpcDocument = {
  methods: OpenRpcMethod[];
};

const openRpcDocument = openRpcDocumentJson as OpenRpcDocument;

const requestDefinitions = requestSchemaJson.definitions as Record<
  string,
  { properties?: { method?: { const?: string } } }
>;

const requestSchemaNameByMethod = new Map(
  Object.entries(requestDefinitions).flatMap(([name, definition]) =>
    definition.properties?.method?.const ? [[definition.properties.method.const, name] as const] : [],
  ),
);

const commandMethods = new Map(
  openRpcDocument.methods.flatMap((method) => {
    const command = method["x-isle-command"];
    if (!command) return [];
    return [
      [
        method.name,
        {
          ...command,
          paramsSchemaName: method["x-isle-params-schema"]?.split("#/definitions/")[1] ?? null,
          requestSchemaName: requestSchemaNameByMethod.get(method.name) ?? null,
        },
      ] as const,
    ];
  }),
);

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: true, strictTypes: false });
ajv.addSchema(modelSchemaJson);
ajv.addSchema(permissionsSchemaJson);
ajv.addSchema(accessSchemaJson);
ajv.addSchema(resultSchemaJson);
ajv.addSchema(eventSchemaJson);

const validateRequestSchema = ajv.compile(requestSchemaJson);
const validateResponseSchema = ajv.compile(responseSchemaJson);
const validateNotificationSchema = ajv.compile(notificationSchemaJson);
const validateEventSchema = ajv.getSchema(eventSchemaJson.$id);
const validateResultSchema = ajv.getSchema(resultSchemaJson.$id);

const errorDetails = (errors?: ErrorObject[] | null) =>
  (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "invalid value",
    params: error.params,
  }));

export const validateJsonRpcRequest = (value: unknown) => ({
  valid: Boolean(validateRequestSchema(value)),
  errors: errorDetails(validateRequestSchema.errors),
});

export const validateJsonRpcResponse = (value: unknown) => ({
  valid: Boolean(validateResponseSchema(value)),
  errors: errorDetails(validateResponseSchema.errors),
});

export const validateJsonRpcNotification = (value: unknown) => ({
  valid: Boolean(validateNotificationSchema(value)),
  errors: errorDetails(validateNotificationSchema.errors),
});

export const validateRuntimeEvent = (value: unknown) => ({
  valid: Boolean(validateEventSchema?.(value)),
  errors: errorDetails(validateEventSchema?.errors),
});

export const validateRuntimeResult = (value: unknown) => ({
  valid: Boolean(validateResultSchema?.(value)),
  errors: errorDetails(validateResultSchema?.errors),
});

const validatedProtocolValue = <TValue>(
  value: unknown,
  validate: (candidate: unknown) => { valid: boolean; errors: ReturnType<typeof errorDetails> },
  label: string,
): TValue => {
  const validation = validate(value);
  if (!validation.valid) {
    throw new Error(`${label} 不符合 agent runtime wire schema：${JSON.stringify(validation.errors)}`);
  }
  return value as TValue;
};

export class JsonRpcProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly id: JsonRpcId | null = null,
    readonly data?: unknown,
    readonly shouldRespond = true,
  ) {
    super(message);
    this.name = "JsonRpcProtocolError";
  }
}

const requestIdFrom = (value: unknown): JsonRpcId | null => {
  if (!value || typeof value !== "object" || !("id" in value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" || (typeof id === "number" && Number.isInteger(id)) ? id : null;
};

export const agentRuntimeCommandFromJsonRpc = (
  value: unknown,
  internalRequestId: string | null,
): AgentRuntimeCommand => {
  const id = requestIdFrom(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JsonRpcProtocolError(-32600, "Invalid Request", id);
  }

  const method = (value as { method?: unknown }).method;
  if (typeof method !== "string") {
    throw new JsonRpcProtocolError(-32600, "Invalid Request", id);
  }

  const commandDefinition = commandMethods.get(method);
  if (!commandDefinition) {
    throw new JsonRpcProtocolError(
      -32601,
      `Method not found: ${method}`,
      id,
      undefined,
      Object.prototype.hasOwnProperty.call(value, "id"),
    );
  }

  const validation = validateJsonRpcRequest(value);
  if (!validation.valid) {
    const schemaNames = [commandDefinition.requestSchemaName, commandDefinition.paramsSchemaName].filter(Boolean);
    const relevantErrors = validation.errors.filter(
      (error) =>
        schemaNames.some((name) => error.schemaPath.includes(`/definitions/${name}/`)) ||
        error.schemaPath.startsWith("#/properties/jsonrpc/") ||
        error.schemaPath.startsWith("#/properties/id/") ||
        error.schemaPath === "#/additionalProperties",
    );
    throw new JsonRpcProtocolError(
      -32602,
      `Invalid params for ${method}`,
      id,
      relevantErrors.length > 0 ? relevantErrors : validation.errors,
      Object.prototype.hasOwnProperty.call(value, "id"),
    );
  }

  const request = value as JsonRpcRequest;
  const params = request.params ?? {};
  const commandBase = {
    type: commandDefinition.type,
    requestId: internalRequestId,
  };

  return (
    commandDefinition.paramsMode === "input" ? { ...commandBase, input: params } : { ...params, ...commandBase }
  ) as AgentRuntimeCommand;
};

const recordWithoutRequestId = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value };
  const { requestId: _requestId, ...rest } = value as Record<string, unknown>;
  return rest;
};

export const createJsonRpcSuccessResponse = (id: JsonRpcId, result: unknown): JsonRpcResponse =>
  validatedProtocolValue<JsonRpcResponse>(
    {
      jsonrpc: "2.0",
      id,
      result: recordWithoutRequestId(result),
    },
    validateJsonRpcResponse,
    "JSON-RPC success response",
  );

export const createJsonRpcErrorResponse = (
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse =>
  validatedProtocolValue<JsonRpcResponse>(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data }),
      },
    },
    validateJsonRpcResponse,
    "JSON-RPC error response",
  );

export const createRuntimeNotification = (
  method: JsonRpcNotification["method"],
  params: unknown,
): JsonRpcNotification =>
  validatedProtocolValue<JsonRpcNotification>(
    {
      jsonrpc: "2.0",
      method,
      params: recordWithoutRequestId(params),
    },
    validateJsonRpcNotification,
    `JSON-RPC ${method} notification`,
  );
