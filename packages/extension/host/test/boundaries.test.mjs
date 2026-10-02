import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import ts from "typescript";
import { definePlugin } from "../index.js";
import { ExtensionHost } from "../dist/services/dispatch.js";
import { createExtensionHostClient } from "../services/contracts.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
async function sources(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "test", "scripts"].includes(entry.name))
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await sources(path)));
    else if (/\.(?:[cm]?js|tsx?)$/.test(entry.name)) paths.push(path);
  }
  return paths;
}
test("host and consuming applications are independent from SDK; the host knows no concrete Agent", async () => {
  const hostRoot = fileURLToPath(new URL("../", import.meta.url));
  const pkg = JSON.parse(
    await readFile(join(hostRoot, "package.json"), "utf8"),
  );
  assert.equal(pkg.dependencies["@mewvis/extension-sdk"], undefined);
  for (const directory of [
    hostRoot,
    ...["client", "server", "agent-runtime"].map((name) =>
      join(root, "apps", name, "src"),
    ),
  ]) {
    for (const file of await sources(directory)) {
      const imports = ts.preProcessFile(
        await readFile(file, "utf8"),
        true,
      ).importedFiles;
      for (const { fileName } of imports) {
        assert.doesNotMatch(
          fileName,
          /^@mewvis\/extension-(sdk|adapters)(\/|$)/,
          relative(root, file),
        );
        if (directory === hostRoot)
          assert.doesNotMatch(
            fileName,
            /@earendil-works\/pi-|apps\/|agent-runtime/,
            relative(root, file),
          );
      }
    }
  }
});
test("a native plugin can consume host services without loading SDK or an SDK adapter", async () => {
  const host = new ExtensionHost({
    "session.summarize": async () => ({
      text: "native",
      generatedAt: 1,
      truncated: false,
    }),
  });
  const requirements = { required: ["session.summarize"] };
  const services = createExtensionHostClient(
    (method, input) =>
      host.invoke(method, input, requirements, {
        target: { workspacePath: "/test", chatId: "a" },
        signal: new AbortController().signal,
      }),
    host.check(requirements),
  );
  const plugin = definePlugin({
    id: "native.ui",
    protocolVersion: 1,
    async mount(root, ctx) {
      root.textContent = (
        await ctx.services.session.summarize({ scope: { kind: "session" } })
      ).text;
      return () => {
        root.textContent = "";
      };
    },
  });
  const element = {};
  const dispose = await plugin.mount(element, { services });
  assert.equal(element.textContent, "native");
  dispose();
  assert.equal(element.textContent, "");
  assert.throws(
    () => definePlugin({ id: "sdk", apiVersion: 1, setup() {} }),
    /原生/,
  );
});
