import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { packPlugin } from "../src/tooling.mjs";

test("data SDK is browser-safe and can be packaged from a plugin outside the monorepo", async () => {
  const root = await mkdtemp(join(tmpdir(), "isle-data-sdk-"));
  try {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@example/data-sdk",
        version: "1.0.0",
        type: "module",
        isle: {
          plugin: { version: 1, entry: "./index.js" },
          permissions: ["plugin-data", "plugin-workspaces"],
        },
      }),
    );
    await writeFile(
      join(root, "index.js"),
      `
      import { createPluginDataClient } from "@isle/plugin-sdk/data";
      export const connect = createPluginDataClient;
      export default function apply() {}
    `,
    );
    const { outputRoot } = await packPlugin({ source: root, quiet: true });
    const { connect } = await import(
      pathToFileURL(join(outputRoot, "index.js")).href
    );
    const client = connect({
      version: 1,
      request: async () => ({ ok: true, value: "persisted" }),
    });
    assert.equal(await client.storage.getItem("key"), "persisted");

    const result = await build({
      stdin: {
        contents: 'export * from "@isle/plugin-sdk/data";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      metafile: true,
    });
    assert.ok(result.outputFiles[0].text.includes("createPluginDataClient"));
    assert.deepEqual(
      Object.keys(result.metafile.inputs).filter(
        (path) => !path.endsWith("data/index.js") && path !== "<stdin>",
      ),
      [],
    );
    const manifest = JSON.parse(
      await readFile(join(outputRoot, "package.json"), "utf8"),
    );
    assert.equal(manifest.dependencies, undefined);
    assert.deepEqual(manifest.isle.permissions, [
      "plugin-data",
      "plugin-workspaces",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
