import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { createReadStream } from "node:fs";
import {
  onlyKeys,
  nonempty,
  type JsonObject,
} from "../../shared/validation.js";
import { FileAccess } from "./access.js";
import {
  fileError as fail,
  chunkLimit,
  lifetime,
  type FileInfo,
} from "./common.js";

type Upload = {
  connection: string;
  filePath: string;
  temporary: string;
  handle: FileHandle;
  dev: number;
  ino: number;
  offset: number;
  overwrite: boolean;
  expectedModifiedAt?: number;
  touchedAt: number;
};

/** Ordinary file operations and connection-owned atomic uploads. */
export class FileOperations {
  private uploads = new Map<string, Upload>();
  constructor(private access: FileAccess) {}
  /** Publishes a host-created result without JSON/base64 transfer or replacing an existing file. */
  async publish(
    connection: string,
    source: string,
    destination: string,
    signal: AbortSignal,
    seal: () => void,
  ) {
    const target = await this.access.authorize(
      connection,
      destination,
      "write",
    );
    await fs.mkdir(dirname(target), { recursive: true });
    await this.access.authorize(connection, target, "write");
    const temporary = join(
      dirname(target),
      `.mewvis-media-${randomUUID()}.tmp`,
    );
    const handle = await fs.open(temporary, "wx", 0o600);
    const identity = await handle.stat();
    try {
      for await (const bytes of createReadStream(source, { signal })) {
        signal.throwIfAborted();
        let offset = 0;
        while (offset < bytes.length)
          offset += (await handle.write(bytes, offset, bytes.length - offset))
            .bytesWritten;
      }
      await handle.sync();
      await handle.close();
      await this.access.authorize(connection, target, "write");
      const current = await fs.lstat(temporary);
      if (
        current.isSymbolicLink() ||
        current.dev !== identity.dev ||
        current.ino !== identity.ino
      )
        fail("FILE_CHANGED", "成片保存期间临时文件被替换", 409);
      signal.throwIfAborted();
      seal();
      await fs.link(temporary, target);
      await fs.unlink(temporary);
      return { ...(await this.info(target)), type: "file" as const };
    } finally {
      await handle.close().catch(() => {});
      // Never remove a substituted file or follow a replaced parent during cleanup.
      try {
        await this.access.authorize(connection, temporary, "write");
        const current = await fs.lstat(temporary);
        if (current.dev === identity.dev && current.ino === identity.ino)
          await fs.unlink(temporary);
      } catch {}
    }
  }
  private async info(path: string): Promise<FileInfo> {
    const stat = await fs.lstat(path);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
      fail("INVALID_FILE", "只支持普通文件和目录");
    return {
      filePath: path,
      name: basename(path),
      type: stat.isFile() ? "file" : "directory",
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    };
  }
  private number(
    value: unknown,
    name: string,
    fallback: number,
    max = Number.MAX_SAFE_INTEGER,
  ) {
    if (value === undefined) return fallback;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > max
    )
      fail("INVALID_ARGUMENT", `${name} 无效`);
    return value;
  }
  async dispatch(
    connection: string,
    method: string,
    p: JsonObject,
  ): Promise<unknown> {
    if (method === "roots") {
      onlyKeys(p, []);
      const scope = await this.access.caller(connection);
      return { dataPath: scope.dataPath, workspacePaths: scope.workspacePaths };
    }
    if (
      method === "stat" ||
      method === "list" ||
      method === "mkdir" ||
      method === "remove"
    ) {
      onlyKeys(p, ["filePath"]);
      const path = await this.access.authorize(
        connection,
        p.filePath,
        method === "mkdir" ? "write" : method === "remove" ? "delete" : "read",
      );
      if (method === "stat") return this.info(path);
      if (method === "mkdir") {
        await fs.mkdir(path, { recursive: true });
        return this.info(path);
      }
      if (method === "remove") {
        if ((await this.info(path)).type === "directory") await fs.rmdir(path);
        else await fs.unlink(path);
        return null;
      }
      const entries = await fs.readdir(path, { withFileTypes: true });
      if (entries.length > 4096)
        fail("LIMIT_EXCEEDED", "目录最多包含 4096 个可列举项");
      const result: FileInfo[] = [];
      for (const entry of entries) {
        if (!entry.isFile() && !entry.isDirectory()) continue;
        const child = await this.access.authorize(
          connection,
          join(path, entry.name),
          "read",
        );
        result.push(await this.info(child));
      }
      return result.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (method === "read") {
      onlyKeys(p, ["filePath", "offset", "length"]);
      const offset = this.number(p.offset, "offset", 0),
        length = this.number(p.length, "length", chunkLimit, chunkLimit);
      const { handle } = await this.access.openRead(
        connection,
        nonempty(p.filePath, "filePath"),
      );
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        const stat = await handle.stat();
        return {
          data: buffer.subarray(0, bytesRead).toString("base64"),
          size: stat.size,
          modifiedAt: stat.mtimeMs,
          eof: offset + bytesRead >= stat.size,
        };
      } finally {
        await handle.close();
      }
    }
    if (method === "write.begin") {
      onlyKeys(p, ["filePath", "overwrite", "expectedModifiedAt"]);
      if (p.overwrite !== undefined && typeof p.overwrite !== "boolean")
        fail("INVALID_ARGUMENT", "overwrite 必须是布尔值");
      if (
        p.expectedModifiedAt !== undefined &&
        (typeof p.expectedModifiedAt !== "number" ||
          !Number.isFinite(p.expectedModifiedAt))
      )
        fail("INVALID_ARGUMENT", "expectedModifiedAt 无效");
      const filePath = await this.access.authorize(
        connection,
        p.filePath,
        "write",
      );
      if (
        [...this.uploads.values()].filter((u) => u.connection === connection)
          .length >= 4
      )
        fail("LIMIT_EXCEEDED", "同时保存的文件超过上限", 429);
      await fs.mkdir(dirname(filePath), { recursive: true });
      await this.access.authorize(connection, filePath, "write");
      const id = randomUUID(),
        temporary = join(dirname(filePath), `.mewvis-save-${id}.tmp`);
      const handle = await fs.open(temporary, "wx", 0o600);
      const identity = await handle.stat();
      this.uploads.set(id, {
        connection,
        filePath,
        temporary,
        handle,
        dev: identity.dev,
        ino: identity.ino,
        offset: 0,
        overwrite: p.overwrite === true,
        expectedModifiedAt: p.expectedModifiedAt as number | undefined,
        touchedAt: Date.now(),
      });
      return { id };
    }
    if (["write.chunk", "write.commit", "write.abort"].includes(method)) {
      onlyKeys(p, method === "write.chunk" ? ["id", "offset", "data"] : ["id"]);
      const id = nonempty(p.id, "id"),
        upload = this.uploads.get(id);
      if (!upload || upload.connection !== connection)
        fail("PERMISSION_DENIED", "文件保存请求已失效", 403);
      await this.access.authorize(connection, upload.filePath, "write");
      if (method === "write.abort") {
        await this.abortUpload(id);
        return null;
      }
      if (method === "write.chunk") {
        const offset = this.number(p.offset, "offset", 0);
        if (
          offset !== upload.offset ||
          typeof p.data !== "string" ||
          p.data.length > Math.ceil(chunkLimit / 3) * 4 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            p.data,
          )
        )
          fail("INVALID_ARGUMENT", "文件块顺序或 Base64 内容无效");
        const bytes = Buffer.from(p.data, "base64");
        if (bytes.length > chunkLimit)
          fail("LIMIT_EXCEEDED", "文件块超过 64 KiB");
        let written = 0;
        while (written < bytes.length)
          written += (
            await upload.handle.write(
              bytes,
              written,
              bytes.length - written,
              offset + written,
            )
          ).bytesWritten;
        upload.offset += bytes.length;
        upload.touchedAt = Date.now();
        return null;
      }
      try {
        let existing: FileInfo | undefined;
        try {
          existing = await this.info(upload.filePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (existing?.type === "directory")
          fail("INVALID_FILE", "保存目标不能是目录");
        if (
          upload.expectedModifiedAt !== undefined &&
          existing?.modifiedAt !== upload.expectedModifiedAt
        )
          fail("FILE_CHANGED", "文件已被其他操作修改", 409);
        if (existing && !upload.overwrite)
          fail(
            "FILE_EXISTS",
            "目标文件已存在；覆盖必须明确指定 overwrite",
            409,
          );
        await upload.handle.sync();
        await upload.handle.close();
        await this.access.authorize(connection, upload.filePath, "write");
        if (upload.overwrite)
          await fs.rename(upload.temporary, upload.filePath);
        else {
          await fs.link(upload.temporary, upload.filePath);
          await fs.unlink(upload.temporary);
        }
        this.uploads.delete(id);
        return this.info(upload.filePath);
      } catch (error) {
        await this.abortUpload(id);
        throw error;
      }
    }
    if (method === "copy" || method === "move") {
      onlyKeys(p, ["source", "destination"]);
      const source = await this.access.authorize(
        connection,
        p.source,
        method === "move" ? "delete" : "read",
      );
      const destination = await this.access.authorize(
        connection,
        p.destination,
        "write",
      );
      if (source === destination)
        fail("INVALID_ARGUMENT", "源文件和目标文件不能相同");
      const { handle, stat: original } = await this.access.openRead(
        connection,
        source,
      );
      let id: string | undefined;
      let committed = false;
      try {
        id = (
          (await this.dispatch(connection, "write.begin", {
            filePath: destination,
          })) as { id: string }
        ).id;
        const bytes = Buffer.alloc(chunkLimit);
        let offset = 0;
        for (;;) {
          const { bytesRead } = await handle.read(
            bytes,
            0,
            bytes.length,
            offset,
          );
          if (!bytesRead) break;
          await this.dispatch(connection, "write.chunk", {
            id,
            offset,
            data: bytes.subarray(0, bytesRead).toString("base64"),
          });
          offset += bytesRead;
        }
        const current = await fs.lstat(
          await this.access.authorize(
            connection,
            source,
            method === "move" ? "delete" : "read",
          ),
        );
        if (
          current.dev !== original.dev ||
          current.ino !== original.ino ||
          current.mtimeMs !== original.mtimeMs ||
          current.size !== original.size
        )
          fail("FILE_CHANGED", "复制期间源文件发生变化", 409);
        const result = await this.dispatch(connection, "write.commit", { id });
        committed = true;
        if (method === "move") {
          await this.access.authorize(connection, source, "delete");
          await fs.unlink(source);
        }
        return result;
      } catch (error) {
        if (id) await this.abortUpload(id);
        if (committed && method === "move") {
          await this.access.authorize(connection, destination, "delete");
          await fs.unlink(destination);
        }
        throw error;
      } finally {
        await handle.close();
      }
    }
    fail("INVALID_ARGUMENT", "未知文件操作");
  }
  private async abortUpload(id: string) {
    const upload = this.uploads.get(id);
    if (!upload) return;
    this.uploads.delete(id);
    await upload.handle.close().catch(() => {});
    try {
      const current = await fs.lstat(upload.temporary);
      if (
        (await this.access.canonical(upload.temporary)) === upload.temporary &&
        current.dev === upload.dev &&
        current.ino === upload.ino
      )
        await fs.unlink(upload.temporary);
    } catch {}
  }
  async disconnect(connection: string) {
    for (const [id, upload] of this.uploads)
      if (upload.connection === connection) await this.abortUpload(id);
  }
  async sweep(now: number) {
    for (const [id, upload] of this.uploads)
      if (upload.touchedAt + lifetime < now) await this.abortUpload(id);
  }
}
