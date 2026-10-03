import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { packApplication } from "../src/tooling.mjs";

test("data SDK is browser-safe and can be packaged from a application outside the monorepo", async () => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-data-sdk-"));
  try {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@example/data-sdk",
        version: "1.0.0",
        type: "module",
        mewvis: {
          app: { version: 1, entry: "./index.js" },
          permissions: ["application-data", "application-workspaces"],
        },
      }),
    );
    await writeFile(
      join(root, "index.js"),
      `
      import { createApplicationDataClient } from "@mewvis/app-sdk/data";
      export const connect = createApplicationDataClient;
      export default function apply() {}
    `,
    );
    const { outputRoot } = await packApplication({ source: root, quiet: true });
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
        contents: 'export * from "@mewvis/app-sdk/data";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      metafile: true,
    });
    assert.ok(
      result.outputFiles[0].text.includes("createApplicationDataClient"),
    );
    assert.deepEqual(
      Object.keys(result.metafile.inputs).filter(
        (path) =>
          !path.endsWith("data/index.js") &&
          path !== "<stdin>" &&
          !/\/product-config\/(?:index\.js|product\.config\.json)$/.test(path),
      ),
      [],
    );
    const manifest = JSON.parse(
      await readFile(join(outputRoot, "package.json"), "utf8"),
    );
    assert.equal(manifest.dependencies, undefined);
    assert.deepEqual(manifest.mewvis.permissions, [
      "application-data",
      "application-workspaces",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
