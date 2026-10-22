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
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { startServer } from "../../dist/server.js";
import { token } from "../support/helpers.mjs";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#5a56d6"/></svg>';

async function fixture(t, icon) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "mewvis-app-icons-")),
  );
  const server = await startServer({
    port: 0,
    token,
    runtime: {
      cliPath: fileURLToPath(
        new URL("../support/fixtures/runtime.mjs", import.meta.url),
      ),
      dataDir: join(root, "data"),
      bundledApplicationsPath: join(root, "none"),
    },
  });
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const call = async (command, input = {}) => {
    const response = await fetch(`${server.url}/api/commands/${command}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input }),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  const source = join(root, "source");
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(join(source, "assets/icon.svg"), svg);
  await writeFile(
    join(source, "index.js"),
    'export default { name: "icon", apply() {} };',
  );
  await writeFile(
    join(source, "package.json"),
    JSON.stringify({
      name: "@example/icon",
      version: "1.0.0",
      type: "module",
      mewvis: {
        app: { version: 1, entry: "./index.js" },
        permissions: [],
        ...(icon === undefined ? {} : { icon }),
      },
    }),
  );
  const installed = await call("install_application", {
    sourcePath: source,
    enable: false,
  });
  return { root, call, installed };
}

test("application icon metadata survives installation and icons load separately even for disabled apps", async (t) => {
  const { call, installed } = await fixture(t, "./assets/icon.svg");
  assert.equal(installed.icon, "./assets/icon.svg");
  assert.equal(installed.enabled, false);
  const apps = await call("list_applications");
  assert.equal(apps[0].icon, "./assets/icon.svg");
  assert.equal(
    await call("get_application_icon", { applicationId: installed.id }),
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHHcAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(join(installed.path, "assets/icon.png"), png);
  const manifestPath = join(installed.path, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.mewvis.icon = "./assets/icon.png";
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.equal(
    await call("get_application_icon", { applicationId: installed.id }),
    `data:image/png;base64,${png.toString("base64")}`,
  );
});

test("old apps without icon declarations use the default without breaking the catalog", async (t) => {
  const { call, installed } = await fixture(t);
  assert.equal(installed.icon, null);
  assert.equal(
    await call("get_application_icon", { applicationId: installed.id }),
    null,
  );
});

test("bad optional icons never expose package-external files or prevent listing applications", async (t) => {
  const { root, call, installed } = await fixture(t, "./assets/icon.svg");
  const manifestPath = join(installed.path, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const outside = join(root, "outside.svg");
  await writeFile(outside, svg);
  await symlink(outside, join(installed.path, "assets/link.svg"));
  await writeFile(
    join(installed.path, "assets/large.png"),
    Buffer.alloc(256 * 1024 + 1),
  );
  await mkdir(join(installed.path, "assets/directory.svg"));
  for (const icon of [
    true,
    "https://example.com/icon.png",
    outside,
    "./../../outside.svg",
    "./assets/../assets/icon.svg",
    "./assets\\icon.svg",
    "./assets/missing.png",
    "./index.js",
    "./assets/large.png",
    "./assets/directory.svg",
    "./assets/link.svg",
  ]) {
    manifest.mewvis.icon = icon;
    await writeFile(manifestPath, JSON.stringify(manifest));
    assert.equal((await call("list_applications")).length, 1);
    assert.equal(
      await call("get_application_icon", { applicationId: installed.id }),
      null,
      String(icon),
    );
  }
});
