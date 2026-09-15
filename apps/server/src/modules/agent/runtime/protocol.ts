import { Ajv, type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  object,
  ServiceError,
  type JsonObject,
} from "../../../shared/validation.js";
export interface RpcRequest {
  jsonrpc: "2.0";
  id?: string;
  method: string;
  params: JsonObject;
}
export type RuntimeMessage =
  | { kind: "response"; id: unknown; value: JsonObject }
  | { kind: "error"; id: unknown; error: JsonObject }
  | { kind: "event" | "result"; value: JsonObject };

/** Uses the existing wire schemas; the server does not import or change engine internals. */
export class RuntimeProtocol {
  private readonly request: ValidateFunction;
  private readonly response: ValidateFunction;
  private readonly notification: ValidateFunction;

  constructor(protocolDir: string) {
    const schema = (name: string) =>
      JSON.parse(
        readFileSync(join(protocolDir, `schema/${name}.schema.json`), "utf8"),
      );
    const ajv = new Ajv({
      allErrors: false,
      allowUnionTypes: true,
      strict: true,
      strictTypes: false,
    });
    for (const name of ["model", "permissions", "access", "result", "event"])
      ajv.addSchema(schema(name));
    this.request = ajv.compile(schema("request"));
    this.response = ajv.compile(schema("response"));
    this.notification = ajv.compile(schema("notification"));
  }

  command(method: string, params: JsonObject, id?: string): RpcRequest {
    const value: RpcRequest = {
      jsonrpc: "2.0",
      ...(id === undefined ? {} : { id }),
      method,
      params,
    };
    if (!this.request(value))
      throw new ServiceError(
        400,
        "INVALID_ARGUMENT",
        `请求不符合 Runtime 协议：${method}`,
      );
    return value;
  }

  decode(line: string): RuntimeMessage {
    const raw = object(JSON.parse(line), "Runtime message");
    if (Boolean(this.response(raw))) {
      if ("error" in raw)
        return { kind: "error", id: raw.id, error: object(raw.error) };
      return { kind: "response", id: raw.id, value: object(raw.result) };
    }
    if (Boolean(this.notification(raw))) {
      return {
        kind: raw.method === "runtime/event" ? "event" : "result",
        value: object(raw.params),
      };
    }
    throw new Error("Runtime 输出不符合 JSON-RPC 协议");
  }
}
