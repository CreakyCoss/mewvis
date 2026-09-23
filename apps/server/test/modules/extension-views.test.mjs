import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionHostAdapter } from "@isle/extension-host/services/session";
import { Extensions } from "../../dist/modules/extensions/service.js";

test("UI view leases bind session reads, filter private data, and revoke pending results", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-ui-views-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = join(root, "plugin");
  await mkdir(pkg);
  const manifest = {
    name: "test.ui",
    version: "1.0.0",
    type: "module",
    "isle.plugin": {
      schemaVersion: 1,
      protocolVersion: 1,
      id: "test.ui",
      host: { required: ["session.read"] },
      modules: {
        ui: {
          entry: "ui.js",
          contributions: [
            {
              id: "stats",
              title: "Stats",
              type: "sidebar",
              icon: "chart",
              view: { id: "overview" },
              slot: "session.sidebar",
            },
          ],
        },
      },
    },
  };
  const save = () =>
    writeFile(join(pkg, "package.json"), JSON.stringify(manifest));
  await save();
  await writeFile(
    join(pkg, "ui.js"),
    "throw new Error('server must never execute UI');",
  );
  let calls = 0,
    changes = 0,
    blocked;
  const targets = [];
  const ledger = {
    sessionRootDir: "/internal/path",
    runtimeInstructions: [{ content: "secret" }],
    messages: [
      { messageRecordId: "u1", role: "user", content: "hello", timestamp: 1 },
      {
        messageRecordId: "a1",
        role: "assistant",
        content: "world",
        timestamp: 2,
      },
      {
        messageRecordId: "p1",
        role: "assistant",
        content: "private",
        metadata: { scope: "agent_private" },
      },
      { messageRecordId: "s1", role: "system", content: "system prompt" },
    ],
    runtimeLinks: [
      {
        linkId: "r1",
        messageRecordIds: ["u1", "a1"],
        status: "done",
        startedAt: 1,
        endedAt: 2,
      },
      { linkId: "r2", messageRecordIds: ["p1"], status: "done" },
    ],
  };
  const service = new Extensions(join(root, "data"), undefined, {
    changed() {
      changes++;
    },
    host: createSessionHostAdapter({
      async readSession(target) {
        calls++;
        targets.push(target);
        if (blocked) await blocked;
        return ledger;
      },
    }),
  });
  const commands = service.commands();
  await commands.add_extension({ path: pkg });
  assert.equal(changes, 1);
  assert.deepEqual(service.list()[0].modules, ["ui"]);
  assert.equal(service.list()[0].error, null);
  const panels = await commands.list_extension_ui_contributions({});
  assert.equal(panels[0].title, "Stats");
  const open = () =>
    commands.open_extension_view({
      id: "test.ui",
      contributionId: "stats",
      viewId: "overview",
      workspacePath: root,
      chatId: "a",
    });
  await assert.rejects(
    commands.open_extension_view({
      id: "test.ui",
      contributionId: "stats",
      viewId: "undeclared",
      workspacePath: root,
      chatId: "a",
    }),
    /插件视图已停用或过期/,
  );
  await assert.rejects(
    commands.open_extension_view({
      id: "test.ui",
      contributionId: "undeclared",
      viewId: "overview",
      workspacePath: root,
      chatId: "a",
    }),
    /插件视图已停用或过期/,
  );
  let view = await open();
  assert.equal(view.contributionId, "stats");
  assert.equal(view.viewId, "overview");
  const query = () =>
    commands.query_extension_view({
      token: view.token,
      method: "session.read",
      requestId: 1,
    });
  const snapshot = await query();
  assert.deepEqual(
    snapshot.messages.map((item) => item.id),
    ["u1", "a1"],
  );
  assert.deepEqual(
    snapshot.runs.map((item) => item.id),
    ["r1"],
  );
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /private|secret|internal|system prompt/,
  );
  assert.deepEqual(targets[0], { workspacePath: root, chatId: "a" });
  await assert.rejects(
    commands.query_extension_view({
      token: view.token,
      method: "session.read",
      requestId: 1,
      chatId: "b",
    }),
    /未知字段/,
  );
  await assert.rejects(
    commands.query_extension_view({
      token: view.token,
      method: "session.delete",
      requestId: 1,
    }),
    /未获得/,
  );
  assert.equal(calls, 1);
  let release;
  blocked = new Promise((resolve) => {
    release = resolve;
  });
  const pending = query();
  await assert.rejects(query(), /进行中/);
  await commands.configure_extension({ id: "test.ui", enabled: false });
  release();
  await assert.rejects(pending, /已取消/);
  await assert.rejects(query(), /停用或过期/);
  assert.deepEqual(await commands.list_extension_ui_contributions({}), []);
  await assert.rejects(open(), /停用或过期/);
  await commands.configure_extension({ id: "test.ui", enabled: true });
  view = await open();
  assert.notEqual(
    (await commands.list_extension_ui_contributions({}))[0].revision,
    panels[0].revision,
  );
  await commands.close_extension_view({ token: view.token });
  await assert.rejects(query(), /停用或过期/);
  manifest["isle.plugin"].host.required = [];
  await save();
  view = await open();
  await assert.rejects(query(), /未获得/);
  await commands.remove_extension({ id: "test.ui" });
  await assert.rejects(query(), /停用或过期/);
});

test("text contributions are discoverable without a JS entry and cannot open executable views", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-text-views-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = join(root, "plugin");
  await mkdir(pkg);
  await writeFile(
    join(pkg, "package.json"),
    JSON.stringify({
      name: "test.text",
      version: "1.0.0",
      type: "module",
      "isle.plugin": {
        schemaVersion: 1,
        protocolVersion: 1,
        id: "test.text",
        modules: {
          ui: {
            contributions: [
              {
                id: "ready",
                slot: "session.status",
                type: "text",
                text: "Ready",
              },
            ],
          },
        },
      },
    }),
  );
  const service = new Extensions(join(root, "data"));
  const commands = service.commands();
  await commands.add_extension({ path: pkg });
  const [contribution] = await commands.list_extension_ui_contributions({});
  assert.equal(contribution.type, "text");
  assert.equal(contribution.text, "Ready");
  assert.equal(service.list()[0].error, null);
  await assert.rejects(
    commands.open_extension_view({
      id: "test.text",
      contributionId: "ready",
      viewId: "overview",
      workspacePath: root,
      chatId: "a",
    }),
    /停用或过期/,
  );
  await commands.configure_extension({ id: "test.text", enabled: false });
  assert.deepEqual(await commands.list_extension_ui_contributions({}), []);
});
