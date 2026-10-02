import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";
import { dshBundleCompatibilityPlugin } from "@mewvis/app-dev/dsh";

const temp = await realpath(await mkdtemp(join(tmpdir(), "mewvis-app-layout-")));
const put = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};
const missing = async (path) => assert.rejects(stat(path), { code: "ENOENT" });
function database(path, rows = []) {
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE application_kv(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE application_workspaces(id TEXT PRIMARY KEY, name TEXT, path TEXT UNIQUE, is_default INTEGER);",
  );
  for (const [id, workspace, isDefault] of rows)
    db.prepare("INSERT INTO application_workspaces VALUES (?, ?, ?, ?)").run(id, id, workspace, isDefault);
  db.prepare("INSERT INTO application_kv VALUES (?, ?)").run(
    "selection",
    JSON.stringify({ workspaceId: "default-id", chatId: "chat-1" }),
  );
  db.close();
}
try {
  const bundle = join(temp, "migration.mjs");
  await build({
    stdin: {
      contents:
        'export * from "./layout-migration.ts"; export * from "./application-paths.ts"; export * from "./cordis-host.ts";',
      resolveDir: resolve("../../packages/app/host/src"),
      loader: "ts",
    },
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    plugins: [dshBundleCompatibilityPlugin],
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });
  const { migrateApplicationLayout, applicationDirectory, legacyApplicationDirectory, CordisApplicationHost } = await import(
    pathToFileURL(bundle)
  );
  for (const [id, name] of [
    ["@mewvis/chat-playground", "@mewvis/chat-playground"],
    ["dsh-rss", "dsh-rss"],
    ["../data", "%2e%2e%2fdata"],
    ["data", "%64ata"],
    ["A", "%41"],
  ]) {
    assert.equal(applicationDirectory(temp, id), join(temp, name));
  }
  const root = join(temp, "apps"),
    owner = "@mewvis/chat-playground";
  const old = legacyApplicationDirectory(root, owner),
    next = applicationDirectory(root, owner);
  const external = join(temp, "external"),
    shared = applicationDirectory(root, "other");
  const oldWorkspace = join(old, "workspace"),
    workspace = join(next, "workspace");
  const marker = JSON.stringify({
    version: 1,
    id: "default-id",
    applications: [owner, "other"],
    extra: { preserved: true },
  });
  await put(join(oldWorkspace, ".mewvis/workspace.json"), marker);
  await put(join(oldWorkspace, ".mewvis/chats/chat-1/messages.json"), '[{"text":"original"}]');
  await put(join(external, "keep.txt"), "external");
  await mkdir(shared, { recursive: true });
  database(join(old, "storage.sqlite"), [
    ["default-id", oldWorkspace, 1],
    ["external-id", external, 0],
  ]);
  database(join(shared, "storage.sqlite"), [["default-id", oldWorkspace, 0]]);
  await put(join(root, "packages", "legacy-external", "package.json"), JSON.stringify({ name: "@test/external" }));
  await put(join(root, "packages", "legacy-external", "index.js"), "export default {};");
  await put(join(root, "settings.yaml"), "{}\n");
  await put(join(root, "settings.yaml.pre-namespace-migration.bak"), "dsh-rss:\n  feeds: [old]\n");
  await put(join(root, "dsh-rss/settings.yaml"), "$version: 1\nfeeds: [current]\n");

  // A real SQLite error interrupts after renames; retry must finish the same migration.
  const blocker = new DatabaseSync(join(shared, "storage.sqlite"));
  blocker.exec(
    "CREATE TRIGGER blocked BEFORE UPDATE ON application_workspaces BEGIN SELECT RAISE(FAIL, 'fixture interruption'); END",
  );
  blocker.close();
  await assert.rejects(migrateApplicationLayout(root, [owner, "@mewvis/rss-reader"]), /fixture interruption/);
  assert.equal((await stat(join(root, ".layout-migration.json"))).isFile(), true);
  assert.equal(
    await readFile(join(root, "settings.yaml"), "utf8"),
    "{}\n",
    "cleanup must wait for database verification",
  );
  const unblock = new DatabaseSync(join(shared, "storage.sqlite"));
  unblock.exec("DROP TRIGGER blocked");
  unblock.close();
  await migrateApplicationLayout(root, [owner, "@mewvis/rss-reader"]);
  for (const name of [
    "data",
    "packages",
    "dsh-rss",
    "settings.yaml",
    "settings.yaml.pre-namespace-migration.bak",
    ".layout-migration.json",
  ])
    await missing(join(root, name));
  assert.equal(await readFile(join(workspace, ".mewvis/workspace.json"), "utf8"), marker);
  assert.equal(
    await readFile(join(workspace, ".mewvis/chats/chat-1/messages.json"), "utf8"),
    '[{"text":"original"}]',
  );
  await missing(join(next, "data"));
  assert.equal(await readFile(join(external, "keep.txt"), "utf8"), "external");
  assert.equal((await stat(join(root, "@test/external/package/index.js"))).isFile(), true);
  for (const directory of [next, shared]) {
    const db = new DatabaseSync(join(directory, "storage.sqlite"));
    assert.equal(db.prepare("SELECT path FROM application_workspaces WHERE id='default-id'").get().path, workspace);
    assert.deepEqual(JSON.parse(db.prepare("SELECT value FROM application_kv WHERE key='selection'").get().value), {
      workspaceId: "default-id",
      chatId: "chat-1",
    });
    if (directory === next)
      assert.equal(db.prepare("SELECT path FROM application_workspaces WHERE id='external-id'").get().path, external);
    db.close();
  }
  const settings = join(root, "@mewvis/rss-reader/settings.yaml");
  assert.deepEqual(load(await readFile(settings, "utf8")), {
    $mewvisApplicationSettings: 1,
    "dsh-rss": { $version: 1, feeds: ["current"] },
  });
  const before = (await stat(settings)).mtimeMs;
  await migrateApplicationLayout(root, [owner, "@mewvis/rss-reader"]);
  assert.equal((await stat(settings)).mtimeMs, before, "repeated startup leaves migrated configuration untouched");

  const conflict = join(temp, "conflict");
  await put(join(legacyApplicationDirectory(conflict, "sample"), "workspace", "keep"), "old");
  await put(join(applicationDirectory(conflict, "sample"), "workspace", "keep"), "new");
  await assert.rejects(migrateApplicationLayout(conflict), /目标已存在/);
  assert.equal(await readFile(join(legacyApplicationDirectory(conflict, "sample"), "workspace", "keep"), "utf8"), "old");
  await missing(join(conflict, ".layout-migration.json"));
  const invalid = join(temp, "invalid");
  await put(join(invalid, "settings.yaml"), "- not-a-map\n");
  await assert.rejects(migrateApplicationLayout(invalid), /YAML 对象/);
  await missing(join(invalid, ".layout-migration.json"));

  // Settings with the same logical namespace are physically isolated by application identity.
  const isolated = join(temp, "isolated");
  for (const id of ["one", "two"])
    await put(join(isolated, id, "settings.yaml"), `$mewvisApplicationSettings: 1\nshared:\n  value: ${id}\n`);
  const host = await CordisApplicationHost.create({ applicationSettingsRoot: isolated });
  const providers = [];
  try {
    for (const id of ["one", "two"])
      await host.load(id, {
        inject: ["settings"],
        apply(ctx) {
          providers.push(ctx.settings);
        },
      });
    assert.equal(providers.length, 2);
    assert.notEqual(providers[0], providers[1]);
    await host.unload("one");
    await host.load("one", {
      inject: ["settings"],
      apply(ctx) {
        assert.ok(ctx.settings);
      },
    });
  } finally {
    await host.dispose();
  }
  assert.equal((await readdir(isolated)).length, 2);
  console.log(
    "PASS namespace migration, crash retry, shared/default/external workspaces, settings preservation, cleanup, isolation and conflicts",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
