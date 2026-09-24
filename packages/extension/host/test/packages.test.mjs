import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createExtensionPackageManager,
  readExtensionPackage,
  resolveExtensionPackages,
} from "../management/index.mjs";

async function fixture(t, id = "test.package") {
  const root = await mkdtemp(join(tmpdir(), "isle-package-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "plugin");
  await mkdir(directory);
  const pkg = {
    name: id,
    version: "1.0.0",
    type: "module",
    "isle.plugin": {
      schemaVersion: 1,
      id,
      protocolVersion: 1,
      modules: { agent: { entry: "./index.js", capabilities: ["commands"] } },
      configuration: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["limit"],
          properties: { limit: { type: "integer", minimum: 1 } },
        },
        defaults: { limit: 10 },
      },
    },
  };
  const save = () =>
    writeFile(join(directory, "package.json"), JSON.stringify(pkg));
  await save();
  await writeFile(
    join(directory, "index.js"),
    "throw new Error('metadata loading must not execute code');",
  );
  return {
    root,
    directory,
    pkg,
    save,
    settings: join(root, "settings/extensions.json"),
  };
}

test("metadata validation never executes code; configuration defaults and host risks", async (t) => {
  const f = await fixture(t);
  const pkg = readExtensionPackage(f.directory);
  assert.equal(pkg.manifest.id, "test.package");
  const [source] = resolveExtensionPackages([
    { path: f.directory, config: { limit: 3 }, commandRisks: { hello: "low" } },
  ]);
  assert.deepEqual(source.config, { limit: 3 });
  assert.equal(source.commandRisks.hello, "low");
  assert.equal(
    resolveExtensionPackages([{ path: f.directory }])[0].config.limit,
    10,
  );
  assert.throws(
    () =>
      resolveExtensionPackages([{ path: f.directory, config: { limit: "3" } }]),
    /配置无效/,
  );
  assert.throws(
    () =>
      resolveExtensionPackages([{ path: f.directory, config: { limit: NaN } }]),
    /JSON/,
  );
  assert.throws(
    () =>
      resolveExtensionPackages([{ path: f.directory }, { path: f.directory }]),
    /重复/,
  );
});

test("modular packages isolate UI from Agent sources and validate every entry", async (t) => {
  const f = await fixture(t);
  const { id } = f.pkg["isle.plugin"];
  f.pkg["isle.plugin"] = {
    schemaVersion: 1,
    id,
    protocolVersion: 1,
    modules: {
      ui: {
        entry: "./ui.js",
        contributions: [
          {
            id: "stats",
            type: "sidebar",
            icon: "chart",
            view: { id: "overview" },
            slot: "session.sidebar",
            title: "Stats",
          },
        ],
      },
    },
  };
  await writeFile(
    join(f.directory, "ui.js"),
    "throw new Error('UI must not execute in host');",
  );
  await f.save();
  const contribution = f.pkg["isle.plugin"].modules.ui.contributions[0];
  for (const field of ["title", "icon", "view"]) {
    const value = contribution[field];
    delete contribution[field];
    await f.save();
    assert.throws(() => readExtensionPackage(f.directory), /清单无效/);
    contribution[field] = value;
  }
  const validView = contribution.view;
  for (const invalid of [
    null,
    {},
    { id: "" },
    { id: "overview", script: "untrusted" },
  ]) {
    contribution.view = invalid;
    await f.save();
    assert.throws(() => readExtensionPackage(f.directory), /清单无效/);
  }
  contribution.view = validView;
  contribution.icon = "arbitrary-icon";
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /清单无效/);
  contribution.icon = "chart";
  await f.save();
  assert.equal(readExtensionPackage(f.directory).modules.agent, undefined);
  assert.deepEqual(resolveExtensionPackages([{ path: f.directory }]), []);
  await rm(join(f.directory, "ui.js"));
  assert.deepEqual(resolveExtensionPackages([{ path: f.directory }]), []);
  assert.throws(() => readExtensionPackage(f.directory), /ENOENT/);
  await writeFile(
    join(f.directory, "ui.js"),
    "throw new Error('not evaluated');",
  );
  const manager = createExtensionPackageManager(f.settings);
  await manager.add(f.directory);
  assert.equal(manager.list().length, 1);
  f.pkg["isle.plugin"].modules.agent = {
    entry: "./index.js",
    capabilities: ["commands"],
  };
  await f.save();
  assert.deepEqual(manager.resolve()[0].capabilities, ["commands"]);
  assert.equal(
    manager.resolve()[0].entry,
    await realpath(join(f.directory, "index.js")),
  );
  const ui = f.pkg["isle.plugin"].modules.ui;
  ui.contributions.push({ ...ui.contributions[0] });
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /重复/);
  ui.contributions.pop();
  ui.entry = "../escape.js";
  await f.save();
  assert.throws(
    () => readExtensionPackage(f.directory, { checkEntry: false }),
    /包内/,
  );
  ui.entry = "./index.js";
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /共享入口/);
  ui.entry = "./ui.js";
  f.pkg["isle.plugin"].host = { required: ["session.write"] };
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /尚不支持/);
  f.pkg["isle.plugin"].host = { required: [] };
  delete f.pkg["isle.plugin"].modules.agent;
  f.pkg["isle.plugin"].id = "test.changed";
  await f.save();
  assert.throws(() => manager.resolve(), /身份已改变/);
});

test("entry traversal, symlink escape, unsupported versions and capabilities fail closed", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, "outside.js"), "");
  for (const entry of ["../outside.js", join(f.root, "outside.js")]) {
    f.pkg["isle.plugin"].modules.agent.entry = entry;
    await f.save();
    assert.throws(() => readExtensionPackage(f.directory), /包内/);
  }
  await symlink(join(f.root, "outside.js"), join(f.directory, "escape.js"));
  f.pkg["isle.plugin"].modules.agent.entry = "escape.js";
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /包内/);
  f.pkg["isle.plugin"].modules.agent.entry = "index.js";
  f.pkg["isle.plugin"].modules.agent.capabilities.push("context.transform");
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /尚不支持/);
  f.pkg["isle.plugin"].modules.agent.capabilities = [];
  f.pkg["isle.plugin"].apiVersion = 2;
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /清单无效/);

  const manifest = f.pkg["isle.plugin"];
  manifest.apiVersion = 1;
  manifest.schemaVersion = 1;
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /清单无效/);
  manifest.schemaVersion = 2;
  manifest.entry = "./index.js";
  manifest.capabilities = ["commands"];
  delete manifest.modules;
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /清单无效/);
});

test("persistent registration, configure rollback, disable missing package, remove preserves files", async (t) => {
  const f = await fixture(t);
  const manager = createExtensionPackageManager(f.settings);
  assert.deepEqual(manager.list(), []);
  await manager.add(f.directory);
  await assert.rejects(() => manager.add(f.directory), /重复/);
  await manager.configure("test.package", { config: { limit: 2 } });
  const resumed = createExtensionPackageManager(f.settings);
  assert.equal(resumed.resolve()[0].config.limit, 2);
  await assert.rejects(
    () => resumed.configure("test.package", { config: { limit: 0 } }),
    /配置无效/,
  );
  assert.equal(resumed.resolve()[0].config.limit, 2);
  await rm(join(f.directory, "index.js"));
  await resumed.configure("test.package", { enabled: false });
  assert.deepEqual(resumed.resolve(), []);
  await assert.rejects(
    () => resumed.configure("test.package", { enabled: true }),
    /ENOENT/,
  );
  assert.equal(resumed.list()[0].enabled, false);
  await resumed.remove("test.package");
  assert.deepEqual(resumed.list(), []);
  assert.ok(await readFile(join(f.directory, "package.json")));
});

test("concurrent managers preserve updates and package identity cannot change silently", async (t) => {
  const f = await fixture(t);
  const other = await fixture(t, "test.other");
  const a = createExtensionPackageManager(f.settings),
    b = createExtensionPackageManager(f.settings);
  await Promise.all([a.add(f.directory), b.add(other.directory)]);
  assert.equal(a.list().length, 2);
  f.pkg["isle.plugin"].id = "test.changed";
  await f.save();
  assert.throws(() => b.resolve(), /身份已改变/);
  await writeFile(f.settings, "{broken");
  await assert.rejects(() => b.remove("test.package"));
  assert.equal(await readFile(f.settings, "utf8"), "{broken");
});

test("bundled discovery, overrides, relocation and local registration share one catalog", async (t) => {
  const f = await fixture(t);
  const { cp } = await import("node:fs/promises");
  const bundledPath = join(f.root, "installation/extensions");
  await mkdir(bundledPath, { recursive: true });
  await cp(f.directory, join(bundledPath, "plugin"), { recursive: true });
  const manager = createExtensionPackageManager(f.settings, { bundledPath });
  assert.equal(manager.list()[0].source, "bundled");
  assert.equal(manager.resolve()[0].config.limit, 10);
  await assert.rejects(readFile(f.settings), { code: "ENOENT" }); // Discovery does not write registrations.
  await assert.rejects(() => manager.add(f.directory), /重复/);
  await assert.rejects(
    () => manager.remove("test.package"),
    /内置插件不能移除/,
  );
  await manager.configure("test.package", { config: { limit: 3 } });
  await assert.rejects(
    () => manager.configure("test.package", { config: { limit: 0 } }),
    /配置无效/,
  );
  const other = await fixture(t, "test.local");
  await Promise.all([
    manager.configure("test.package", { enabled: false }),
    createExtensionPackageManager(f.settings, { bundledPath }).add(
      other.directory,
    ),
  ]);
  assert.deepEqual(
    manager.resolve().map((item) => item.id),
    ["test.local"],
  );
  const settings = JSON.parse(await readFile(f.settings, "utf8"));
  assert.deepEqual(settings.bundled["test.package"], {
    config: { limit: 3 },
    enabled: false,
  });
  assert.equal(settings.packages.length, 1);
  assert.ok(!JSON.stringify(settings).includes(bundledPath));

  const relocated = join(f.root, "upgraded/extensions");
  await cp(bundledPath, relocated, { recursive: true });
  await rm(bundledPath, { recursive: true });
  const upgraded = createExtensionPackageManager(f.settings, {
    bundledPath: relocated,
  });
  assert.equal(upgraded.list()[0].enabled, false);
  await upgraded.configure("test.package", { enabled: true });
  assert.equal(upgraded.resolve()[0].config.limit, 3);
  assert.equal(
    upgraded.resolve()[0].entry,
    await realpath(join(relocated, "plugin/index.js")),
  );
  await rm(join(relocated, "plugin/index.js"));
  await upgraded.configure("test.package", { enabled: false });
  assert.deepEqual(
    upgraded.resolve().map((item) => item.id),
    ["test.local"],
  );
  await upgraded.remove("test.local");
  assert.equal(upgraded.list().length, 1);
});

test("UI protocol validates slot/type pairs and permits data-only text modules", async (t) => {
  const f = await fixture(t);
  const contribution = {
    id: "status",
    slot: "session.status",
    type: "text",
    text: "Ready",
    tone: "info",
  };
  const ui = { contributions: [contribution] };
  f.pkg["isle.plugin"].modules = { ui };
  await f.save();
  assert.equal(readExtensionPackage(f.directory).modules.ui.entry, undefined);
  assert.deepEqual(resolveExtensionPackages([{ path: f.directory }]), []);
  const { uiSlotDefinitions } = await import("@isle/extension-host/ui");
  assert.equal(uiSlotDefinitions.sessionStatus.type, contribution.type);
  for (const invalid of [
    { ...contribution, slot: "session.sidebar" },
    { ...contribution, slot: "unknown.slot" },
    { ...contribution, type: "html" },
    { ...contribution, tone: "execute" },
    // Sidebar views require an executable entry even if the current UI host does not implement them.
    {
      id: "view",
      slot: "session.sidebar",
      type: "sidebar",
      icon: "chart",
      view: { id: "overview" },
      title: "View",
    },
  ]) {
    ui.contributions = [invalid];
    await f.save();
    assert.throws(() => readExtensionPackage(f.directory), /清单无效/);
  }
  ui.contributions = [contribution];
  ui.panels = [];
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /清单无效/);
});

test("session actions require complete metadata and a declared session dialog", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.directory, "ui.js"), "throw new Error('metadata loading must not execute UI');");
  const dialog = {
    id: "editor", slot: "session.dialog", type: "dialog", title: "Editor", size: "sm", view: { id: "editor" },
  };
  const action = {
    id: "open-editor", slot: "session.composer-actions", type: "action", title: "Open editor",
    icon: "puzzle", trigger: { kind: "dialog", id: "editor" },
  };
  const ui = { entry: "./ui.js", contributions: [dialog, action] };
  f.pkg["isle.plugin"].modules = { ui };
  await f.save();
  assert.equal(readExtensionPackage(f.directory).modules.ui.contributions.length, 2);
  for (const invalid of [
    { ...action, title: undefined },
    { ...action, icon: undefined },
    { ...action, trigger: { kind: "command", id: "editor" } },
    { ...action, trigger: { kind: "dialog", id: "missing" } },
  ]) {
    ui.contributions = [dialog, invalid];
    await f.save();
    assert.throws(() => readExtensionPackage(f.directory), /清单无效|必须指向/);
  }
  ui.contributions = [{ ...dialog, slot: "plugin.dialog" }, action];
  await f.save();
  assert.throws(() => readExtensionPackage(f.directory), /必须指向/);
});
