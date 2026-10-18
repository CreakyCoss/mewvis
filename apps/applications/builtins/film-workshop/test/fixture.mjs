import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const result = await build({
  stdin: {
    contents:
      'export * from "./main/model"; export * from "./main/view-state"; export * from "./main/repository"; export * from "./main/example"; export * from "./main/assistant-context"; export * from "./main/media"; export * from "./main/delivery/plan"; export * from "./main/assistant/proposals"; export * from "./main/assistant/store"; export * from "./main/assistant/media-requests"; export * from "./main/assistant/instructions"; export * from "./main/host/proposals"; export * from "./main/host/media"; export { default as tools } from "./main/host/tools";',
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
