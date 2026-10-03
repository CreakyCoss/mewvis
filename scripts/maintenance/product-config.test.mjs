import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const definitions = JSON.parse(
  await readFile(
    join(root, "scripts/maintenance/product-definitions.json"),
    "utf8",
  ),
);
const config = JSON.parse(
  await readFile(join(root, "apps/product.config.json"), "utf8"),
);

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "product-config-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of new Set([
    "apps/product.config.json",
    "apps/client/index.html",
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/src-tauri/Cargo.toml",
    "scripts/maintenance/sync-product-config.mjs",
    "scripts/maintenance/product-definitions.json",
    "packages/product-config/index.js",
    "packages/product-config/package.json",
    ...Object.keys(definitions),
  ])) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await cp(join(root, file), join(directory, file));
  }
  const sync = (...args) =>
    execFileSync(
      process.execPath,
      [join(directory, "scripts/maintenance/sync-product-config.mjs"), ...args],
      { encoding: "utf8", stdio: "pipe" },
    );
  const readJson = async (file) =>
    JSON.parse(await readFile(join(directory, file), "utf8"));
  const writeConfig = (value) =>
    writeFile(
      join(directory, "apps/product.config.json"),
      JSON.stringify(value),
    );
  return { directory, sync, readJson, writeConfig };
}

test("one product configuration reaches runtime, desktop, HTML and package contracts", async (t) => {
  const { directory, sync, readJson, writeConfig } = await fixture(t);
  const changed = {
    ...config,
    displayName: 'Harbor "<test>',
    namespace: "harbor",
    envPrefix: "HARBOR",
    appDataDirName: ".harbor-data",
    bundleName: "Harbor",
    windowTitle: "Harbor Window",
    bundleIdentifier: "com.harbor.desktop",
    description: "Harbor Desktop Client",
    schemas: {
      applicationOrigin: "https://harbor.example",
      runtimeOrigin: "https://runtime.harbor.example",
    },
    assets: { brandMark: "/assets/harbor.png" },
    versionControl: {
      authorName: "Harbor Author",
      authorEmail: "author@harbor.example",
    },
  };
  await writeConfig(changed);
  sync();
  sync("--check");
  const shared = await import(
    pathToFileURL(join(directory, "packages/product-config/index.js"))
  );
  assert.equal(shared.APP_DATA_DIR_NAME, ".harbor-data");
  assert.equal(shared.productDataName("-txn-"), ".harbor-data-txn-");
  assert.equal(shared.envName("SERVER_PORT"), "HARBOR_SERVER_PORT");
  assert.equal(shared.PRODUCT_KEYS.applicationManifest, "harbor");
  assert.equal(
    shared.PRODUCT_KEYS.applicationReactGlobal,
    "harborApplicationReact",
  );
  // A shipped SDK facade must resolve the generated identity outside the repo.
  const dependency = join(directory, "node_modules/@mewvis/product-config");
  await mkdir(dirname(dependency), { recursive: true });
  await symlink(join(directory, "packages/product-config"), dependency);
  const facadeFile = join(directory, "chat-ui.mjs");
  await cp(join(root, "packages/app/sdk/chat/react.js"), facadeFile);
  const chat = Object.freeze({});
  globalThis[shared.PRODUCT_KEYS.applicationChatGlobal] = { Chat: chat };
  try {
    assert.equal((await import(pathToFileURL(facadeFile))).Chat, chat);
  } finally {
    delete globalThis[shared.PRODUCT_KEYS.applicationChatGlobal];
  }
  assert.equal(
    shared.PRODUCT_CONFIG.versionControl.authorEmail,
    changed.versionControl.authorEmail,
  );
  assert.ok(Object.isFrozen(shared.PRODUCT_CONFIG.assets));
  const desktop = await readJson("apps/desktop/src-tauri/tauri.conf.json");
  assert.equal(desktop.identifier, changed.bundleIdentifier);
  assert.equal(desktop.app.windows[0].title, changed.windowTitle);
  const html = await readFile(
    join(directory, "apps/client/index.html"),
    "utf8",
  );
  assert.ok(html.includes("Harbor &quot;&lt;test&gt;"));
  assert.ok(html.includes(changed.assets.brandMark));
  assert.ok(!html.includes(">Mewv</span"));
  const rust = await readFile(
    join(directory, "apps/desktop/src-tauri/src/product_config.rs"),
    "utf8",
  );
  assert.ok(rust.includes('"HARBOR_SERVER_RESOURCES"'));
  const application = await readJson(
    "apps/applications/builtins/docs-reader/package.json",
  );
  assert.ok(application.harbor);
  assert.equal(application.mewvis, undefined);
  assert.equal(application.name, "@mewvis/docs-reader");
  const extension = await readJson(
    "packages/extension/sdk/manifest.schema.json",
  );
  assert.ok(extension.properties["harbor.extension"]);
  assert.ok(extension.required.includes("harbor.extension"));
  const request = await readJson(
    "apps/agent-runtime/protocol/v1/schema/request.schema.json",
  );
  assert.equal(request.title, "Mewvis Agent Runtime JSON-RPC Request");
  const snapshot = await readFile(
    join(directory, "packages/product-config/index.d.ts"),
    "utf8",
  );
  sync();
  assert.equal(
    await readFile(
      join(directory, "packages/product-config/index.d.ts"),
      "utf8",
    ),
    snapshot,
  );
  await writeConfig(config);
  sync();
  sync("--check");
  assert.ok(
    (await readJson("apps/applications/builtins/docs-reader/package.json"))[
      config.namespace
    ],
  );
  assert.equal(
    (await readJson("apps/applications/builtins/docs-reader/package.json"))
      .harbor,
    undefined,
  );
});

test("checking stale outputs is read-only, and invalid directory names are rejected", async (t) => {
  const { directory, sync, writeConfig } = await fixture(t);
  sync();
  const target = join(directory, "packages/product-config/product.config.json");
  const before = await readFile(target, "utf8");
  await writeConfig({ ...config, envPrefix: "OTHER" });
  assert.throws(() => sync("--check"), /output is stale/);
  assert.equal(await readFile(target, "utf8"), before);
  await writeConfig({ ...config, appDataDirName: "../other" });
  assert.throws(() => sync(), /Invalid appDataDirName/);
  assert.equal(await readFile(target, "utf8"), before);
});
