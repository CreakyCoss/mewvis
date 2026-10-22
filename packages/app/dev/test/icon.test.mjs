import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { packApplication, validateApplication } from "../src/tooling.mjs";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#5a56d6"/></svg>';

async function fixture(t, project) {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "mewvis-icon-pack-")),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "source");
  await mkdir(join(source, "assets"), { recursive: true });
  const manifest = { name: "@example/icon", type: "module", version: "1.0.0" };
  const declaration = {
    app: { version: 1, entry: "./index.js" },
    permissions: [],
    icon: "./assets/icon.svg",
  };
  if (project) {
    await writeFile(
      join(source, "app.config.ts"),
      'export default { displayName: "Icon app", permissions: [], ui: false, icon: "./assets/icon.svg" };',
    );
  } else {
    manifest.mewvis = declaration;
    await writeFile(
      join(source, "index.js"),
      'export default { name: "icon", apply() {} };',
    );
  }
  await writeFile(join(source, "package.json"), JSON.stringify(manifest));
  await writeFile(join(source, "assets/icon.svg"), svg);
  return { directory, source, manifest, declaration };
}

for (const project of [false, true]) {
  test(`${project ? "app.config.ts" : "package.json"} icons ship automatically in both distribution targets`, async (t) => {
    const { directory, source } = await fixture(t, project);
    for (const target of ["mewvis", "dsh"]) {
      const { outputRoot, manifest } = await packApplication({
        source,
        target,
        outDir: join(directory, target),
        quiet: true,
      });
      assert.equal(manifest.mewvis.icon, "./assets/icon.svg");
      assert.equal(
        await readFile(join(outputRoot, "assets/icon.svg"), "utf8"),
        svg,
      );
      await validateApplication(outputRoot);
    }
  });
}

test("icon validation rejects missing, oversized, unsupported and escaping assets; omission stays compatible", async (t) => {
  const { directory, source, manifest } = await fixture(t, false);
  const outside = join(directory, "outside.svg");
  await writeFile(outside, svg);
  await writeFile(
    join(source, "assets/large.png"),
    Buffer.alloc(256 * 1024 + 1),
  );
  await mkdir(join(source, "assets/directory.svg"));
  await symlink(outside, join(source, "assets/link.svg"));
  for (const icon of [
    true,
    "https://example.com/icon.png",
    outside,
    "./../outside.svg",
    "./assets/../assets/icon.svg",
    "./assets\\icon.svg",
    "./assets/missing.png",
    "./index.js",
    "./assets/large.png",
    "./assets/directory.svg",
    "./assets/link.svg",
  ]) {
    manifest.mewvis.icon = icon;
    await writeFile(join(source, "package.json"), JSON.stringify(manifest));
    await assert.rejects(validateApplication(source), undefined, String(icon));
  }
  delete manifest.mewvis.icon;
  await writeFile(join(source, "package.json"), JSON.stringify(manifest));
  const { manifest: output } = await packApplication({
    source,
    outDir: join(directory, "without-icon"),
    quiet: true,
  });
  assert.equal(output.mewvis.icon, undefined);
});
