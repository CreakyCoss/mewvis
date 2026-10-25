import * as fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { basename, extname } from "node:path";
import type { EventHub } from "../../infrastructure/events/event-hub.js";
import { FileAccess } from "./access.js";
import {
  fileError as fail,
  chunkLimit,
  lifetime,
  type FilePreview,
  type PreviewKind,
} from "./common.js";

type Preview = {
  connection: string;
  filePath: string;
  handle: FileHandle;
  dev: number;
  ino: number;
  modifiedAt: number;
  secret: string;
  info: FilePreview;
  streams: Set<Readable>;
};
const mimeTypes: Record<string, [PreviewKind, string]> = {
  ".png": ["image", "image/png"],
  ".jpg": ["image", "image/jpeg"],
  ".jpeg": ["image", "image/jpeg"],
  ".gif": ["image", "image/gif"],
  ".webp": ["image", "image/webp"],
  ".avif": ["image", "image/avif"],
  ".svg": ["image", "image/svg+xml"],
  ".bmp": ["image", "image/bmp"],
  ".mp4": ["video", "video/mp4"],
  ".webm": ["video", "video/webm"],
  ".mov": ["video", "video/quicktime"],
  ".mp3": ["audio", "audio/mpeg"],
  ".wav": ["audio", "audio/wav"],
  ".ogg": ["audio", "audio/ogg"],
  ".m4a": ["audio", "audio/mp4"],
  ".flac": ["audio", "audio/flac"],
  ".aac": ["audio", "audio/aac"],
  ".weba": ["audio", "audio/webm"],
  ".pdf": ["pdf", "application/pdf"],
};
for (const extension of [
  ".txt",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".log",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".ts",
])
  mimeTypes[extension] = ["text", "text/plain; charset=utf-8"];

/** Read-only file leases, preview metadata and range streams. */
export class FilePreviews {
  private previews = new Map<string, Preview>();
  constructor(
    private access: FileAccess,
    private events: EventHub,
  ) {}
  async open(connection: string, filePath: string, openDialog = false) {
    if (this.previews.size >= 64)
      fail("LIMIT_EXCEEDED", "打开的预览超过上限", 429);
    const { target, handle, stat } = await this.access.openRead(
      connection,
      filePath,
    );
    const [kind, mimeType] = mimeTypes[extname(target).toLowerCase()] ?? [
      "unsupported",
      "application/octet-stream",
    ];
    const info: FilePreview = {
      id: randomUUID(),
      filePath: target,
      name: basename(target),
      size: stat.size,
      mimeType,
      kind,
      expiresAt: Date.now() + lifetime,
    };
    this.previews.set(info.id, {
      connection,
      filePath: target,
      handle,
      dev: stat.dev,
      ino: stat.ino,
      modifiedAt: stat.mtimeMs,
      secret: randomBytes(32).toString("hex"),
      info,
      streams: new Set(),
    });
    if (openDialog) this.events.publish("application-file-preview:open", info);
    return this.describe(info.id);
  }
  async describeForConnection(connection: string, id: string) {
    const preview = this.previews.get(id);
    if (preview && preview.connection !== connection)
      fail("PERMISSION_DENIED", "预览不属于当前连接", 403);
    return this.describe(id);
  }
  async closeForConnection(connection: string, id: string) {
    const preview = this.previews.get(id);
    if (preview && preview.connection !== connection)
      fail("PERMISSION_DENIED", "预览不属于当前连接", 403);
    await this.close(id);
  }
  async close(id: string) {
    const preview = this.previews.get(id);
    if (!preview) return;
    this.previews.delete(id);
    preview.streams.forEach((stream) => stream.destroy());
    await preview.handle.close().catch(() => {});
    this.events.publish("application-file-preview:close", { id });
  }
  async describe(id: string) {
    const preview = await this.checkedPreview(id);
    return {
      ...preview.info,
      resourcePath: `file-previews/${encodeURIComponent(id)}/${preview.secret}`,
    };
  }
  private async checkedPreview(id: string) {
    const preview = this.previews.get(id);
    if (!preview || preview.info.expiresAt < Date.now()) {
      await this.close(id);
      fail("PREVIEW_EXPIRED", "预览已关闭或过期", 410);
    }
    try {
      const path = await this.access.authorize(
        preview.connection,
        preview.filePath,
        "read",
      );
      const stat = await fs.lstat(path);
      if (
        stat.dev !== preview.dev ||
        stat.ino !== preview.ino ||
        stat.mtimeMs !== preview.modifiedAt ||
        stat.size !== preview.info.size
      )
        fail("FILE_CHANGED", "文件内容已变化，请重新打开预览", 409);
      return preview;
    } catch (error) {
      await this.close(id);
      throw error;
    }
  }
  async stream(id: string, secret: string, range?: string, head = false) {
    const stored = this.previews.get(id);
    const actual = Buffer.from(secret),
      expected = Buffer.from(stored?.secret ?? "");
    if (
      !stored ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      fail("PERMISSION_DENIED", "无效的预览资源引用", 403);
    const preview = await this.checkedPreview(id),
      size = preview.info.size;
    let start = 0,
      end = size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]) || size === 0)
        fail("INVALID_RANGE", "文件读取范围无效", 416);
      if (!match[1]) {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0)
          fail("INVALID_RANGE", "文件读取范围无效", 416);
        start = Math.max(0, size - suffix);
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      )
        fail("INVALID_RANGE", "文件读取范围无效", 416);
    }
    // Cancelling a media range must not close the lease's shared file handle.
    // ReadStream.destroy() closes it even when autoClose is false.
    async function* chunks() {
      let position = start;
      while (position <= end) {
        const bytes = Buffer.allocUnsafe(
          Math.min(chunkLimit, end - position + 1),
        );
        const { bytesRead } = await preview.handle.read(
          bytes,
          0,
          bytes.length,
          position,
        );
        if (!bytesRead)
          fail("FILE_CHANGED", "文件内容已变化，请重新打开预览", 409);
        position += bytesRead;
        yield bytes.subarray(0, bytesRead);
      }
    }
    const stream =
      head || size === 0
        ? null
        : Readable.from(chunks(), { objectMode: false });
    if (stream) {
      preview.streams.add(stream);
      stream.once("close", () => preview.streams.delete(stream));
    }
    return {
      info: preview.info,
      size,
      start,
      end,
      partial: Boolean(range),
      stream,
    };
  }
  async disconnect(connection: string) {
    for (const [id, preview] of this.previews)
      if (preview.connection === connection) await this.close(id);
  }
  async sweep(now: number) {
    for (const [id, preview] of this.previews)
      if (preview.info.expiresAt < now) await this.close(id);
  }
}
