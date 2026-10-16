import { randomUUID } from "node:crypto";

/** Isolated preview files; never touches a user's working directory or model. */
export function createFileHost(sampleImage, samples = {}) {
  const files = new Map(),
    writes = new Map(),
    previews = new Map();
  const mediaType = (path) =>
    /\.mp4$/i.test(path)
      ? { kind: "video", mimeType: "video/mp4" }
      : /\.wav$/i.test(path)
        ? { kind: "audio", mimeType: "audio/wav" }
        : {
            kind: "image",
            mimeType: /\.png$/i.test(path) ? "image/png" : "image/jpeg",
          };
  const info = (filePath) => {
    const bytes = files.get(filePath);
    if (!bytes) throw new Error("预览文件不存在");
    return {
      filePath,
      name: filePath.split("/").at(-1),
      type: "file",
      size: bytes.length,
      modifiedAt: 1,
    };
  };
  return {
    resource(id) {
      const path = previews.get(id);
      return path
        ? {
            bytes: files.get(path),
            mimeType: mediaType(path).mimeType,
          }
        : undefined;
    },
    generate(text) {
      const input = JSON.parse(text.slice(text.indexOf("{\n")));
      const purpose = input.purpose ?? "image-generation";
      const kind = {
        "image-generation": "image",
        "video-generation": "video",
        speech: "audio",
      }[purpose];
      const bytes = kind === "image" ? sampleImage : samples[kind];
      if (!bytes) throw new Error("请提供此媒体类型的本地测试样本");
      const filePath = `${input.outputDirectory}/output.${kind === "image" ? "jpg" : kind === "video" ? "mp4" : "wav"}`;
      files.set(filePath, bytes);
      return {
        status: "completed",
        purpose,
        outputs: [
          {
            type: kind,
            filePath,
            mimeType: mediaType(filePath).mimeType,
            size: bytes.length,
          },
        ],
      };
    },
    request({ method, params: p = {} }) {
      let value = null;
      switch (method) {
        case "roots":
          value = { dataPath: "/memory/application-data", workspacePaths: [] };
          break;
        case "mkdir":
          value = {
            filePath: p.filePath,
            name: p.filePath.split("/").at(-1),
            type: "directory",
            size: 0,
            modifiedAt: 1,
          };
          break;
        case "stat":
          value = info(p.filePath);
          break;
        case "write.begin": {
          if (files.has(p.filePath) && !p.overwrite)
            throw new Error("文件已存在");
          const id = randomUUID();
          writes.set(id, { path: p.filePath, bytes: Buffer.alloc(0) });
          value = { id };
          break;
        }
        case "write.chunk": {
          const write = writes.get(p.id);
          if (!write || write.bytes.length !== p.offset)
            throw new Error("写入偏移错误");
          write.bytes = Buffer.concat([
            write.bytes,
            Buffer.from(p.data, "base64"),
          ]);
          break;
        }
        case "write.commit": {
          const write = writes.get(p.id);
          files.set(write.path, write.bytes);
          writes.delete(p.id);
          value = info(write.path);
          break;
        }
        case "write.abort":
          writes.delete(p.id);
          break;
        case "read": {
          const bytes = files.get(p.filePath),
            metadata = info(p.filePath);
          value = {
            data: bytes
              .subarray(p.offset, p.offset + p.length)
              .toString("base64"),
            eof: p.offset + p.length >= bytes.length,
            size: metadata.size,
            modifiedAt: metadata.modifiedAt,
          };
          break;
        }
        case "preview.create":
        case "preview.openDialog": {
          const metadata = info(p.filePath),
            id = randomUUID();
          previews.set(id, p.filePath);
          value = {
            id,
            name: metadata.name,
            size: metadata.size,
            ...mediaType(p.filePath),
            resourcePath: `/resource/${id}`,
            resourceUrl: `http://127.0.0.1:${this.port}/resource/${id}`,
            expiresAt: Date.now() + 3600000,
          };
          break;
        }
        case "preview.close":
          previews.delete(p.id);
          break;
        default:
          throw new Error(`Unsupported preview file method: ${method}`);
      }
      return { ok: true, value };
    },
  };
}
