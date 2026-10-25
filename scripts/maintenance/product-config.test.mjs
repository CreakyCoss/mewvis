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
    "apps/desktop/package.json",
    "apps/client/package.json",
    "apps/server/package.json",
    "apps/agent-runtime/package.json",
    "apps/client/index.html",
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/Cargo.lock",
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
  const writeVersion = async (version) => {
    const manifest = await readJson("package.json");
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ ...manifest, version }),
    );
  };
  return { directory, sync, readJson, writeConfig, writeVersion };
}

test("the root release version synchronizes all application manifests without changing dependency or SDK versions", async (t) => {
  const { directory, sync, readJson, writeVersion } = await fixture(t);
  sync();
  const outputs = [
    ...["desktop", "client", "server", "agent-runtime"].map(
      (application) => `apps/${application}/package.json`,
    ),
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/Cargo.lock",
  ];
  const snapshots = () =>
    Promise.all(outputs.map((file) => readFile(join(directory, file), "utf8")));
  const before = await snapshots();
  const independent = [
    "packages/app/sdk/package.json",
    "apps/applications/builtins/docs-reader/package.json",
    "apps/extensions/session-ledger/package.json",
  ];
  const independentBefore = await Promise.all(independent.map(readJson));
  await writeVersion("1.3.0-rc.2+build.7");
  assert.throws(() => sync("--check"), /output is stale/);
  assert.deepEqual(
    await snapshots(),
    before,
    "check never rewrites stale outputs",
  );
  sync();
  sync("--check");
  for (const file of outputs.filter((file) => file.endsWith(".json"))) {
    assert.equal((await readJson(file)).version, "1.3.0-rc.2+build.7");
  }
  const cargo = await readFile(join(directory, outputs.at(-2)), "utf8");
  assert.match(cargo, /^version = "1\.3\.0-rc\.2\+build\.7"$/m);
  assert.equal(
    cargo.replace(/^version = "[^"]*"$/m, 'version = "<release>"'),
    before.at(-2).replace(/^version = "[^"]*"$/m, 'version = "<release>"'),
    "Cargo dependencies are unchanged",
  );
  const lock = await readFile(join(directory, outputs.at(-1)), "utf8");
  const desktopEntry = /(\nname = "desktop"\nversion = ")[^"]*(")/;
  assert.match(
    lock,
    /\nname = "desktop"\nversion = "1\.3\.0-rc\.2\+build\.7"\n/,
  );
  assert.equal(
    lock.replace(desktopEntry, "$1<release>$2"),
    before.at(-1).replace(desktopEntry, "$1<release>$2"),
    "all other lockfile bytes are unchanged",
  );
  assert.deepEqual(
    await Promise.all(independent.map(readJson)),
    independentBefore,
  );
  const after = await snapshots();
  sync();
  assert.deepEqual(await snapshots(), after, "synchronization is idempotent");
});

test("invalid root release versions fail before writing any generated files", async (t) => {
  const { directory, sync, writeVersion } = await fixture(t);
  sync();
  const targets = [
    "apps/desktop/package.json",
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/Cargo.lock",
    "packages/product-config/product.config.json",
  ];
  const snapshots = () =>
    Promise.all(targets.map((file) => readFile(join(directory, file), "utf8")));
  const before = await snapshots();
  for (const version of [
    "v1.2.3",
    "1.2",
    "01.2.3",
    "1.2.3-01",
    "1.2.3-alpha..1",
    "1.2.3\n",
    123,
  ]) {
    await writeVersion(version);
    assert.throws(() => sync(), /Invalid release version/);
    assert.deepEqual(await snapshots(), before);
  }
});

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

test("OpenRPC metadata synchronization survives method insertion, removal and reordering", async (t) => {
  const { directory, sync, readJson, writeConfig } = await fixture(t);
  const file = "apps/agent-runtime/protocol/v1/openrpc.json";
  const document = await readJson(file);
  const commandKey = `x-${config.namespace}-command`;
  const directionKey = `x-${config.namespace}-direction`;
  const paramsKey = `x-${config.namespace}-params-schema`;
  const extraCommand = structuredClone(
    document.methods.find((method) => method[commandKey]),
  );
  extraCommand.name = "test/new-command";
  const extraNotification = structuredClone(
    document.methods.find((method) => method[directionKey]),
  );
  extraNotification.name = "test/new-notification";
  document.methods = [
    extraNotification,
    ...document.methods.slice(1).reverse(),
    extraCommand,
  ];
  const expected = structuredClone(document.methods);
  await writeFile(join(directory, file), JSON.stringify(document));
  await writeConfig({ ...config, namespace: "harbor" });
  sync();
  sync("--check");
  const renamed = await readJson(file);
  assert.deepEqual(
    renamed.methods.map((method) => method.name),
    expected.map((method) => method.name),
  );
  for (const [index, method] of renamed.methods.entries()) {
    for (const suffix of ["command", "params-schema", "direction"]) {
      const previous = `x-${config.namespace}-${suffix}`;
      assert.deepEqual(method[`x-harbor-${suffix}`], expected[index][previous]);
      assert.equal(method[previous], undefined);
    }
  }
  assert.equal(renamed.methods[0]["x-harbor-command"], undefined);
  assert.deepEqual(
    renamed.methods.at(-1)["x-harbor-command"],
    extraCommand[commandKey],
  );
  assert.equal(
    renamed.methods[0]["x-harbor-params-schema"],
    extraNotification[paramsKey],
  );
  await writeConfig(config);
  sync();
  sync("--check");
  assert.deepEqual((await readJson(file)).methods, expected);
});
