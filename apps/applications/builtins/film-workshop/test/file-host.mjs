import { randomUUID } from "node:crypto";

/** Isolated preview files; never touches a user's working directory or model. */
export function createFileHost(sampleImage) {
  const files = new Map(),
    writes = new Map(),
    previews = new Map();
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
            mimeType: /\.(jpg|jpeg)$/i.test(path)
              ? "image/jpeg"
              : /\.png$/i.test(path)
                ? "image/png"
                : "text/plain",
          }
        : undefined;
    },
    generate(text) {
      const input = JSON.parse(text.slice(text.indexOf("{\n")));
      const filePath = `${input.outputDirectory}/storyboard.jpg`;
      files.set(filePath, sampleImage);
      return {
        status: "completed",
        purpose: "image-generation",
        outputs: [
          {
            type: "image",
            filePath,
            mimeType: "image/jpeg",
            size: sampleImage.length,
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
            mimeType: /\.(jpg|jpeg)$/i.test(p.filePath)
              ? "image/jpeg"
              : "image/png",
            kind: "image",
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
