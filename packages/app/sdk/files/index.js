import { PRODUCT_KEYS } from "@mewvis/product-config";
const chunkSize = 64 * 1024;
export class ApplicationFileError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "ApplicationFileError";
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new ApplicationFileError(code, message);
};
const path = (value) => {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    fail("INVALID_ARGUMENT", "文件路径无效");
  return value;
};
const fileInfo = (value) => {
  if (
    !value ||
    typeof value.filePath !== "string" ||
    typeof value.name !== "string" ||
    !["file", "directory"].includes(value.type) ||
    !Number.isFinite(value.size) ||
    !Number.isFinite(value.modifiedAt)
  )
    fail("INVALID_RESPONSE", "宿主返回的文件信息无效");
  return Object.freeze(value);
};
const encode = (bytes) => {
  let text = "";
  for (let index = 0; index < bytes.length; index += 8192)
    text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(text);
};
const decode = (text) => {
  try {
    const decoded = atob(text);
    return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  } catch {
    fail("INVALID_RESPONSE", "宿主返回的文件块无效");
  }
};

const previewInfo = (value) => {
  if (
    !value ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.mimeType !== "string" ||
    !["image", "video", "audio", "pdf", "text", "unsupported"].includes(
      value.kind,
    ) ||
    !Number.isFinite(value.size) ||
    !Number.isFinite(value.expiresAt) ||
    typeof value.resourcePath !== "string"
  )
    fail("INVALID_RESPONSE", "宿主预览信息无效");
  return Object.freeze(value);
};

/** Application identity and allowed roots belong to the host, never request arguments. */
export function createApplicationFileClient(transport) {
  if (
    !transport ||
    transport.version !== 1 ||
    typeof transport.request !== "function"
  )
    fail("CAPABILITY_UNAVAILABLE", "当前宿主未提供文件服务");
  const request = async (method, params = {}) => {
    let response;
    try {
      response = await transport.request({ version: 1, method, params });
    } catch (error) {
      throw new ApplicationFileError(
        error?.code ?? "TRANSPORT_ERROR",
        error?.message ?? "文件传输失败",
        { cause: error },
      );
    }
    if (response?.ok === false && typeof response.error?.code === "string")
      fail(response.error.code, response.error.message);
    if (response?.ok !== true || !Object.hasOwn(response, "value"))
      fail("INVALID_RESPONSE", "宿主文件响应无效");
    return response.value;
  };
  const client = {
    async roots() {
      const value = await request("roots");
      if (
        !value ||
        typeof value.dataPath !== "string" ||
        !Array.isArray(value.workspacePaths) ||
        value.workspacePaths.some((p) => typeof p !== "string")
      )
        fail("INVALID_RESPONSE", "宿主文件目录信息无效");
      return Object.freeze(value);
    },
    async stat(filePath) {
      return fileInfo(await request("stat", { filePath: path(filePath) }));
    },
    async list(filePath) {
      const value = await request("list", { filePath: path(filePath) });
      if (!Array.isArray(value)) fail("INVALID_RESPONSE", "宿主目录列表无效");
      return value.map(fileInfo);
    },
    async mkdir(filePath) {
      return fileInfo(await request("mkdir", { filePath: path(filePath) }));
    },
    async remove(filePath) {
      await request("remove", { filePath: path(filePath) });
    },
    async copy(source, destination) {
      return fileInfo(
        await request("copy", {
          source: path(source),
          destination: path(destination),
        }),
      );
    },
    async move(source, destination) {
      return fileInfo(
        await request("move", {
          source: path(source),
          destination: path(destination),
        }),
      );
    },
    async *readChunks(filePath) {
      const initial = await client.stat(filePath);
      if (initial.type !== "file") fail("INVALID_FILE", "不能读取目录内容");
      let offset = 0;
      for (;;) {
        const value = await request("read", {
          filePath: path(filePath),
          offset,
          length: chunkSize,
        });
        if (
          !value ||
          typeof value.data !== "string" ||
          typeof value.eof !== "boolean"
        )
          fail("INVALID_RESPONSE", "宿主文件块响应无效");
        if (
          value.size !== initial.size ||
          value.modifiedAt !== initial.modifiedAt
        )
          fail("FILE_CHANGED", "读取期间文件发生变化");
        const bytes = decode(value.data);
        if (
          bytes.length > chunkSize ||
          (!bytes.length && !value.eof) ||
          offset + bytes.length > initial.size
        )
          fail("INVALID_RESPONSE", "宿主文件块大小无效");
        offset += bytes.length;
        if (bytes.length) yield bytes;
        if (value.eof) {
          if (offset !== initial.size)
            fail("INVALID_RESPONSE", "宿主文件内容不完整");
          break;
        }
      }
    },
    async readBinary(filePath, { maxBytes = 16 * 1024 * 1024 } = {}) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
        fail("INVALID_ARGUMENT", "maxBytes 无效");
      const initial = await client.stat(filePath);
      if (initial.size > maxBytes)
        fail("LIMIT_EXCEEDED", "文件超过读取大小上限，请使用 readChunks");
      const output = new Uint8Array(initial.size);
      let offset = 0;
      for await (const bytes of client.readChunks(filePath)) {
        if (offset + bytes.length > output.length)
          fail("FILE_CHANGED", "读取期间文件发生变化");
        output.set(bytes, offset);
        offset += bytes.length;
      }
      if (offset !== output.length)
        fail("FILE_CHANGED", "读取期间文件发生变化");
      return output;
    },
    async readText(filePath, options) {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
          await client.readBinary(filePath, options),
        );
      } catch (error) {
        if (error instanceof ApplicationFileError) throw error;
        fail("INVALID_ENCODING", "文件不是有效的 UTF-8 文本");
      }
    },
    async beginWrite(filePath, options = {}) {
      const params = { filePath: path(filePath) };
      if (options.overwrite !== undefined) params.overwrite = options.overwrite;
      if (options.expectedModifiedAt !== undefined)
        params.expectedModifiedAt = options.expectedModifiedAt;
      const value = await request("write.begin", params);
      if (typeof value?.id !== "string")
        fail("INVALID_RESPONSE", "宿主文件保存标识无效");
      return value.id;
    },
    async writeChunk(id, offset, bytes) {
      if (
        !(bytes instanceof Uint8Array) ||
        bytes.length > chunkSize ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      )
        fail("INVALID_ARGUMENT", "文件块或偏移无效");
      await request("write.chunk", { id, offset, data: encode(bytes) });
    },
    async commitWrite(id) {
      return fileInfo(await request("write.commit", { id }));
    },
    async abortWrite(id) {
      await request("write.abort", { id });
    },
    async writeBinary(filePath, bytes, options) {
      if (!(bytes instanceof Uint8Array))
        fail("INVALID_ARGUMENT", "文件内容必须是 Uint8Array");
      const id = await client.beginWrite(filePath, options);
      try {
        for (let offset = 0; offset < bytes.length; offset += chunkSize)
          await client.writeChunk(
            id,
            offset,
            bytes.subarray(offset, offset + chunkSize),
          );
        return await client.commitWrite(id);
      } catch (error) {
        await client.abortWrite(id).catch(() => {});
        throw error;
      }
    },
    async writeText(filePath, text, options) {
      if (typeof text !== "string")
        fail("INVALID_ARGUMENT", "文件内容必须是文本");
      return client.writeBinary(
        filePath,
        new TextEncoder().encode(text),
        options,
      );
    },
    preview: Object.freeze({
      async create({ filePath }) {
        return previewInfo(
          await request("preview.create", { filePath: path(filePath) }),
        );
      },
      async describe(id) {
        return previewInfo(await request("preview.describe", { id }));
      },
      async open(container, input, options) {
        const { mountFilePreview } = await import("./view.js");
        return mountFilePreview(container, input, client, options);
      },
      async openDialog({ filePath }) {
        return previewInfo(
          await request("preview.openDialog", { filePath: path(filePath) }),
        );
      },
      subscribe(listener) {
        return transport.subscribe?.(listener) ?? (() => {});
      },
      async close(id) {
        await request("preview.close", { id });
      },
    }),
  };
  return Object.freeze(client);
}
export function getApplicationFileClient() {
  return createApplicationFileClient(
    globalThis[PRODUCT_KEYS.applicationGlobal]?.files,
  );
}
