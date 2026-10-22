import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  mkdtemp,
  mkdir,
  stat,
  readFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createApplicationDataClient } from "@mewvis/app-sdk/data";
import { createApplicationFileClient } from "@mewvis/app-sdk/files";

const compiled = await build({
  stdin: {
    contents:
      'export * from "./main/model"; export * from "./main/repository"; export * from "./main/save-queue"; export * from "./main/render";',
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "es2022",
});
const moduleRoot = await mkdtemp(join(tmpdir(), "design-test-module-"));
const moduleFile = join(moduleRoot, "fixture.mjs");
await writeFile(moduleFile, compiled.outputFiles[0].text);
export const api = await import(pathToFileURL(moduleFile).href);
await rm(moduleRoot, { recursive: true });

/** A disk-backed, isolated SDK test host. All paths are confined to one temporary directory. */
export async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "mewvis-design-test-"));
  const records = new Map(),
    writes = new Map();
  const state = { directory: root, cancelCreate: false, failWrite: false };
  const safe = (path) => {
    const result = resolve(path);
    if (result !== root && !result.startsWith(root + "/"))
      throw new Error("测试路径越界");
    return result;
  };
  const info = async (path) => {
    const value = await stat(safe(path));
    return {
      filePath: path,
      name: basename(path),
      type: value.isDirectory() ? "directory" : "file",
      size: value.size,
      modifiedAt: value.mtimeMs,
    };
  };
  const response = async (action) => {
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      return {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      };
    }
  };
  const dataRequest = (request) =>
    response(async () => {
      const p = request.params || {};
      switch (request.method) {
        case "workspaces.selectDirectory":
          return state.directory;
        case "workspaces.list":
          return [...records.values()];
        case "workspaces.get": {
          const workspace = records.get(p.id);
          if (!workspace) throw new Error("工作区未登记");
          await stat(workspace.path);
          return workspace;
        }
        case "workspaces.create": {
          if (state.cancelCreate) return null;
          const path = safe(p.path || state.directory);
          if (p.exclusive) await mkdir(path);
          else await mkdir(path, { recursive: true });
          const previous = [...records.values()].find(
            (item) => item.path === path,
          );
          if (previous) return previous;
          const workspace = {
            id: randomUUID(),
            name: p.name,
            path,
            isDefault: false,
          };
          records.set(workspace.id, workspace);
          return workspace;
        }
        case "workspaces.remove": {
          const workspace = records.get(p.id);
          if (workspace && p.deleteContent)
            await rm(workspace.path, { recursive: true, force: true });
          records.delete(p.id);
          return null;
        }
        default:
          throw new Error("不支持的测试数据请求");
      }
    });
  const fileRequest = (request) =>
    response(async () => {
      const p = request.params || {};
      switch (request.method) {
        case "stat":
          return info(p.filePath);
        case "mkdir":
          await mkdir(safe(p.filePath), { recursive: true });
          return info(p.filePath);
        case "read": {
          const bytes = await readFile(safe(p.filePath));
          const metadata = await info(p.filePath);
          return {
            data: bytes
              .subarray(p.offset, p.offset + p.length)
              .toString("base64"),
            eof: p.offset + p.length >= bytes.length,
            size: bytes.length,
            modifiedAt: metadata.modifiedAt,
          };
        }
        case "write.begin": {
          safe(p.filePath);
          const id = randomUUID();
          writes.set(id, { ...p, bytes: Buffer.alloc(0) });
          return { id };
        }
        case "write.chunk": {
          const write = writes.get(p.id);
          if (!write || write.bytes.length !== p.offset)
            throw new Error("写入顺序错误");
          write.bytes = Buffer.concat([
            write.bytes,
            Buffer.from(p.data, "base64"),
          ]);
          return null;
        }
        case "write.commit": {
          const write = writes.get(p.id);
          if (!write) throw new Error("写入任务不存在");
          if (state.failWrite) {
            state.failWrite = false;
            throw new Error("测试保存失败");
          }
          const existing = await info(write.filePath).catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
          if (existing && !write.overwrite) throw new Error("文件已存在");
          if (
            write.expectedModifiedAt !== undefined &&
            existing?.modifiedAt !== write.expectedModifiedAt
          )
            throw new Error("文件已被外部修改");
          const temporary = `${write.filePath}.${p.id}.tmp`;
          await writeFile(temporary, write.bytes);
          await rename(temporary, write.filePath);
          writes.delete(p.id);
          return info(write.filePath);
        }
        case "write.abort":
          writes.delete(p.id);
          return null;
        default:
          throw new Error(`不支持的测试文件请求：${request.method}`);
      }
    });
  const workspaces = createApplicationDataClient({
    version: 1,
    request: dataRequest,
  }).workspaces;
  const files = createApplicationFileClient({
    version: 1,
    request: fileRequest,
  });
  return {
    root,
    records,
    writes,
    state,
    workspaces,
    files,
    dataRequest,
    fileRequest,
    repository: api.createRepository(workspaces, files),
    close: () => rm(root, { recursive: true, force: true }),
  };
}
