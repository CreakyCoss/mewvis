import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const result = await build({
  stdin: {
    contents:
      'export * from "./main/model"; export * from "./main/progress"; export * from "./main/view-state"; export * from "./main/repository"; export * from "./main/example"; export * from "./main/assistant-context"; export * from "./main/media"; export * from "./main/delivery/plan"; export * from "./main/assistant/proposals"; export * from "./main/assistant/store"; export * from "./main/assistant/media-requests"; export * from "./main/assistant/instructions"; export * from "./main/host/proposals"; export * from "./main/host/media"; export { default as tools } from "./main/host/tools";',
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "es2022",
});
const directory = await mkdtemp(join(tmpdir(), "film-test-"));
const compiled = join(directory, "fixture.mjs");
await writeFile(compiled, result.outputFiles[0].text);
export const fixture = await import(pathToFileURL(compiled).href);
await rm(directory, { recursive: true });

export function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) {
      return structuredClone(values.get(key) ?? null);
    },
    async setItem(key, value) {
      values.set(key, structuredClone(value));
    },
    async removeItem(key) {
      values.delete(key);
    },
    async keys() {
      return [...values.keys()];
    },
  };
}

export function fileServices(root = "/projects") {
  const contents = new Map(),
    chunks = [],
    aborted = [];
  const workspace = { id: "workspace-film", name: "影视", path: root };
  let cancel = false;
  return {
    contents,
    chunks,
    aborted,
    workspace,
    cancel: () => {
      cancel = true;
    },
    workspaces: {
      async create() {
        return cancel ? null : workspace;
      },
      async get() {
        return workspace;
      },
    },
    files: {
      async mkdir() {},
      async writeText(path, text) {
        contents.set(path, text);
      },
      async readText(path) {
        if (!contents.has(path)) throw new Error("项目文件不存在");
        return contents.get(path);
      },
      async beginWrite(path) {
        return path;
      },
      async writeChunk(id, offset, bytes) {
        chunks.push({ id, offset, bytes: bytes.slice() });
      },
      async commitWrite(id) {
        contents.set(
          id,
          Buffer.concat(chunks.filter((c) => c.id === id).map((c) => c.bytes)),
        );
      },
      async abortWrite(id) {
        aborted.push(id);
      },
    },
  };
}
