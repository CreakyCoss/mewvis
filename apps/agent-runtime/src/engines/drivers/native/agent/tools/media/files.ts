import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { constants } from "node:fs";
import { lstat, mkdir, open, link, unlink } from "node:fs/promises";
import {
  fetchMedia,
  type MediaOutput,
  type MediaTransport,
} from "./request.js";
import {
  readJsonPointer,
  type JsonValue,
} from "@mewvis/chat-contracts/model-configuration";
import { z } from "zod";
import type { MediaArtifact } from "./types.js";

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/webm": "weba",
};

const mediaExtension = new RegExp(
  "\\.(?:" +
    [...new Set([...Object.values(extensions), "jpeg", "bin"])].join("|") +
    ")$",
  "i",
);

/** A portable filename stem; the supplied name never controls the output directory or extension. */
function mediaFileStem(name: string | undefined, type: string): string {
  let cleaned = (name ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}<>:"/\\|?*]+/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .replace(mediaExtension, "");
  // Windows reserves device names even when followed by an extension.
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(cleaned))
    cleaned = `media-${cleaned}`;
  let stem = "";
  for (const character of cleaned) {
    if (Buffer.byteLength(stem + character) > 120) break;
    stem += character;
  }
  stem = stem.replace(/[.\s-]+$/g, "");
  if (!stem)
    return `${type}-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  return stem;
}

function detectMime(bytes: Buffer): string | undefined {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (bytes.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (bytes.subarray(0, 3).toString() === "ID3") return "audio/mpeg";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WAVE"
  )
    return "audio/wav";
  if (bytes.subarray(0, 4).toString() === "OggS") return "audio/ogg";
  if (bytes.subarray(0, 4).toString() === "fLaC") return "audio/flac";
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (bytes.subarray(4, 8).toString() === "ftyp") return "video/mp4";
  if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return "video/webm";
  return undefined;
}

/** Bind authorized local files into arbitrary configured JSON input fields. */
export async function prepareMediaInput(
  input: unknown,
  bindings: unknown,
  read: (path: string) => Promise<Buffer>,
): Promise<JsonValue> {
  let result = structuredClone(input) as JsonValue;
  if (bindings === undefined) return result;
  if (!Array.isArray(bindings) || bindings.length > 8)
    throw new Error("files 必须为数组，最多引用 8 个本地文件");
  for (const binding of bindings) {
    const entry = z
      .object({
        pointer: z.string(),
        filePath: z.string().min(1),
        format: z.string().optional(),
        mimeType: z.string().min(1).optional(),
      })
      .strict()
      .parse(binding);
    if (typeof entry.pointer !== "string")
      throw new Error("files.pointer 必须为 JSON Pointer");
    // The shared reader validates pointer syntax and rejects prototype keys.
    readJsonPointer(result, entry.pointer);
    const bytes = await read(entry.filePath);
    const format = entry.format ?? "data-url";
    if (!["data-url", "base64"].includes(String(format)))
      throw new Error("文件格式仅支持 data-url 或 base64");
    const mime =
      entry.mimeType === undefined ? detectMime(bytes) : entry.mimeType;
    if (format === "data-url" && (!mime || !/^[\w.+-]+\/[\w.+-]+$/.test(mime)))
      throw new Error("请为参考文件提供有效 MIME 类型");
    const encoded = bytes.toString("base64");
    const value =
      format === "base64" ? encoded : `data:${mime};base64,${encoded}`;
    if (!entry.pointer) {
      result = value;
      continue;
    }
    const slash = entry.pointer.lastIndexOf("/");
    const parent = readJsonPointer(result, entry.pointer.slice(0, slash));
    const key = entry.pointer
      .slice(slash + 1)
      .replace(/~1/g, "/")
      .replace(/~0/g, "~");
    if (
      !parent ||
      typeof parent !== "object" ||
      (Array.isArray(parent) &&
        (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= parent.length))
    )
      throw new Error("参考文件的目标父结构不存在或数组索引无效");
    Object.defineProperty(parent, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

export async function collectMedia(
  output: MediaOutput,
  options: {
    directory: string;
    outputName?: string;
    index?: number;
    authorize(path: string): Promise<string>;
    transport: MediaTransport;
  },
): Promise<MediaArtifact> {
  const { transport } = options;
  if (output.source === "text" || output.source === "json") {
    if (Buffer.byteLength(JSON.stringify(output.value)) > 32_000)
      throw new Error("媒体附加文本或 JSON 超过 32 KiB");
    return { type: output.type, value: output.value };
  }
  if (typeof output.value !== "string")
    throw new Error("媒体产物必须为 URL 或 Base64 字符串");
  const data = /^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]*)$/.exec(
    output.value,
  );
  let bytes: Buffer | undefined;
  let response: Response | undefined;
  let mimeType = output.mimeType;
  if (output.source === "base64" || data) {
    const encoded = data?.[2] ?? output.value;
    if (
      !encoded.length ||
      encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
    )
      throw new Error("媒体服务返回无效 Base64 内容");
    bytes = Buffer.from(encoded, "base64");
    mimeType ??= data?.[1] ?? detectMime(bytes);
  } else {
    response = await fetchMedia(output.value, { method: "GET" }, transport);
    mimeType ??= response.headers.get("content-type")?.split(";")[0].trim();
  }
  let temporary: string | undefined;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let identity: { dev: number; ino: number } | undefined;
  try {
    if (
      !mimeType ||
      !["image", "video", "audio"].includes(output.type) ||
      !mimeType.toLowerCase().startsWith(output.type + "/")
    )
      throw new Error("生成产物的媒体类型与用途配置不匹配，请检查 MIME 配置");
    mimeType = mimeType.toLowerCase();
    const stem = mediaFileStem(options.outputName, output.type);
    const prefix = stem + (options.index === undefined ? "" : `-${options.index}`);
    const extension = extensions[mimeType] ?? "bin";
    const newFileName = () => `${prefix}-${randomUUID().slice(0, 8)}.${extension}`;
    let fileName = newFileName();
    let filePath = join(options.directory, fileName);
    await options.authorize(filePath);
    await mkdir(options.directory, { recursive: true });
    await options.authorize(filePath);
    temporary = join(
      options.directory,
      ".mewvis-media-" + randomUUID() + ".tmp",
    );
    await options.authorize(temporary);
    handle = await open(temporary, "wx", 0o600);
    identity = await handle.stat();
    let size = 0;
    const source = bytes ? [bytes] : response?.body;
    if (!source) throw new Error("媒体服务返回空文件");
    for await (const chunk of source) {
      transport.signal.throwIfAborted();
      await options.authorize(temporary);
      if (
        size + chunk.length >
        (output.type === "image" ? 64 : output.type === "audio" ? 256 : 2048) *
          1024 *
          1024
      )
        throw new Error(
          "生成文件超过大小上限（图片 64 MiB，音频 256 MiB，视频 2 GiB）",
        );
      let offset = 0;
      while (offset < chunk.length)
        offset += (
          await handle.write(
            chunk,
            offset,
            chunk.length - offset,
            size + offset,
          )
        ).bytesWritten;
      size += chunk.length;
    }
    if (!size) throw new Error("媒体服务返回空文件");
    transport.signal.throwIfAborted();
    await handle.sync();
    await handle.close();
    handle = undefined;
    for (let attempt = 0; ; attempt++) {
      transport.signal.throwIfAborted();
      await options.authorize(filePath);
      await options.authorize(temporary);
      const current = await lstat(temporary);
      if (
        current.dev !== identity.dev ||
        current.ino !== identity.ino ||
        current.nlink !== 1
      )
        throw new Error("保存期间临时文件发生变化");
      try {
        await link(temporary, filePath);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 4)
          throw error;
        fileName = newFileName();
        filePath = join(options.directory, fileName);
      }
    }
    await unlink(temporary);
    temporary = undefined;
    return { type: output.type, filePath, fileName, mimeType, size };
  } finally {
    await handle?.close().catch(() => {});
    if (temporary && identity) {
      try {
        await options.authorize(temporary);
        const current = await lstat(temporary);
        if (current.dev === identity.dev && current.ino === identity.ino)
          await unlink(temporary);
      } catch {}
    }
    if (response?.body && !response.body.locked)
      await response.body.cancel().catch(() => {});
  }
}

export async function readMediaFile(
  path: string,
  authorize: (path: string) => Promise<string>,
  signal: AbortSignal,
) {
  const target = await authorize(path);
  const before = await lstat(target);
  if (!before.isFile() || before.nlink !== 1)
    throw new Error("只允许读取普通且没有多硬链接的文件");
  const handle = await open(
    target,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.ino !== before.ino ||
      stat.dev !== before.dev ||
      stat.size > 16 * 1024 * 1024
    )
      throw new Error("参考文件无效、发生变化或超过 16 MiB");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted();
      await authorize(path);
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!bytesRead) throw new Error("读取参考文件期间文件发生变化");
      offset += bytesRead;
    }
    const current = await lstat(await authorize(path));
    if (
      current.ino !== stat.ino ||
      current.dev !== stat.dev ||
      current.mtimeMs !== stat.mtimeMs ||
      current.size !== stat.size
    )
      throw new Error("读取参考文件期间文件发生变化");
    return bytes;
  } finally {
    await handle.close();
  }
}
