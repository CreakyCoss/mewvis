import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import schema from "../../protocol/v1/schema/application-host.schema.json" with { type: "json" };
import type {
  ApplicationToolHostCall,
  ApplicationToolHostResult,
  ApplicationToolHostResponse,
} from "../engines/protocol/wire.js";

const ajv = new Ajv({ strict: true, strictTypes: false });
ajv.addSchema(schema);
const validate = ajv.getSchema(
  `${schema.$id}#/definitions/ApplicationToolHostResponse`,
)!;

/** Host replies are consumed separately from agent commands and are never recorded as chat events. */
export class ApplicationToolChannel {
  private closed = false;
  private pending = new Map<
    string,
    {
      resolve(value: ApplicationToolHostResult): void;
      reject(error: Error): void;
    }
  >();

  constructor(private readonly write: (message: unknown) => void) {}

  async execute(call: ApplicationToolHostCall, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.closed) throw new Error("应用宿主工具连接已关闭");
    if (this.pending.size >= 16) throw new Error("应用工具请求过多");
    const id = `application-tool:${randomUUID()}`;
    let cancel: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<ApplicationToolHostResult>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        cancel = () => reject(new Error("应用工具请求已取消"));
        signal?.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(
          () =>
            reject(
              new Error("应用宿主工具响应超时；请先确认执行结果，不要自动重试"),
            ),
          65_000,
        );
        timer.unref?.();
        this.write({
          jsonrpc: "2.0",
          id,
          method: "application/tool.execute",
          params: call,
        });
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      this.pending.delete(id);
    }
  }

  receive(line: string) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return false;
    }
    if (
      !value ||
      typeof value !== "object" ||
      !("id" in value) ||
      typeof value.id !== "string" ||
      !value.id.startsWith("application-tool:") ||
      "method" in value
    )
      return false;
    const call = this.pending.get(value.id);
    if (call) {
      if (!validate(value)) call.reject(new Error("应用宿主工具响应无效"));
      else {
        const response = value as ApplicationToolHostResponse;
        if (response.error) call.reject(new Error(response.error.message));
        else call.resolve(response.result!);
      }
    }
    return true; // Ignore late replies to cancelled calls, rather than parsing them as commands.
  }

  close() {
    this.closed = true;
    for (const call of this.pending.values())
      call.reject(new Error("应用宿主工具连接已关闭"));
    this.pending.clear();
  }
}
