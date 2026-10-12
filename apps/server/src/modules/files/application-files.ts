import { Serial } from "../../shared/serial.js";
import {
  ServiceError,
  object,
  onlyKeys,
  nonempty,
  type JsonObject,
} from "../../shared/validation.js";
import type { EventHub } from "../../infrastructure/events/event-hub.js";
import { FileAccess, type FileScopeResolver } from "./access.js";
import { FileOperations } from "./operations.js";
import { FilePreviews } from "./preview.js";
import { fileError as fail } from "./common.js";

export type { FileScope, FileScopeResolver } from "./access.js";
export type { FileInfo, FilePreview, PreviewKind } from "./common.js";

/** File protocol entry point; keeps connection cleanup and mutations serialized. */
export class ApplicationFiles {
  private readonly access: FileAccess;
  private readonly operations: FileOperations;
  private readonly previews: FilePreviews;
  private serial = new Serial();
  private cleanup = setInterval(() => {
    void this.sweep();
  }, 60_000);
  constructor(scope: FileScopeResolver, events: EventHub) {
    this.access = new FileAccess(scope);
    this.operations = new FileOperations(this.access);
    this.previews = new FilePreviews(this.access, events);
    this.cleanup.unref();
  }
  connect(applicationId: string | null) {
    return this.access.connect(applicationId);
  }
  authorize(
    connection: string,
    input: unknown,
    action: "read" | "write" | "delete",
  ) {
    return this.access.authorize(connection, input, action);
  }
  async request(connectionInput: unknown, input: unknown) {
    const connection = nonempty(connectionInput, "connection");
    const request = object(input);
    onlyKeys(request, ["version", "method", "params"]);
    if (request.version !== 1)
      fail("CAPABILITY_UNAVAILABLE", "不支持的文件协议版本");
    if (Buffer.byteLength(JSON.stringify(request)) > 256 * 1024)
      fail("LIMIT_EXCEEDED", "文件请求超过 256 KiB");
    const method = nonempty(request.method, "method");
    const p = request.params === undefined ? {} : object(request.params);
    return this.serial.run(async () => {
      await this.access.caller(connection);
      try {
        const value = await this.dispatch(connection, method, p);
        if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024)
          fail("LIMIT_EXCEEDED", "文件响应超过 2 MiB");
        return value;
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") fail("FILE_NOT_FOUND", "文件或目录不存在", 404);
        if (code === "EEXIST") fail("FILE_EXISTS", "目标文件或目录已存在", 409);
        if (code === "ENOTEMPTY")
          fail("DIRECTORY_NOT_EMPTY", "目录不是空目录", 409);
        fail("FILE_ERROR", "文件操作失败");
      }
    });
  }
  private dispatch(connection: string, method: string, p: JsonObject) {
    if (method === "preview.create" || method === "preview.openDialog") {
      onlyKeys(p, ["filePath"]);
      return this.previews.open(
        connection,
        nonempty(p.filePath, "filePath"),
        method === "preview.openDialog",
      );
    }
    if (method === "preview.describe") {
      onlyKeys(p, ["id"]);
      return this.previews.describeForConnection(
        connection,
        nonempty(p.id, "id"),
      );
    }
    if (method === "preview.close") {
      onlyKeys(p, ["id"]);
      return this.previews
        .closeForConnection(connection, nonempty(p.id, "id"))
        .then(() => null);
    }
    return this.operations.dispatch(connection, method, p);
  }
  closePreview(id: string) {
    return this.previews.close(id);
  }
  describePreview(id: string) {
    return this.previews.describe(id);
  }
  streamPreview(id: string, secret: string, range?: string, head = false) {
    return this.previews.stream(id, secret, range, head);
  }
  async disconnect(connectionInput: unknown) {
    const connection = nonempty(connectionInput, "connection");
    this.access.disconnect(connection);
    await this.serial.run(async () => {
      await this.operations.disconnect(connection);
      await this.previews.disconnect(connection);
    });
  }
  async revoke(applicationId: string) {
    for (const connection of this.access.connectionsFor(applicationId))
      await this.disconnect(connection);
  }
  private async sweep() {
    await this.serial.run(async () => {
      const now = Date.now();
      await this.operations.sweep(now);
      await this.previews.sweep(now);
    });
  }
  async close() {
    clearInterval(this.cleanup);
    for (const connection of this.access.close())
      await this.disconnect(connection);
  }
}
