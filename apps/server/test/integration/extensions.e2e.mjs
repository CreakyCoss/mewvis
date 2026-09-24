import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../dist/server.js";
import { token } from "../support/helpers.mjs";

test("local plugins can be added, disabled, enabled and removed", { timeout: 30_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-local-plugins-"));
  const server = await startServer({
    port: 0,
    token,
    runtime: { dataDir: join(root, "data"), bundledExtensionsPath: join(root, "empty-bundled") },
  });
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const raw = async (name, input = {}) => {
    const response = await fetch(`${server.url}/api/commands/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ input }),
    });
    return { status: response.status, value: await response.json() };
  };
  const call = async (name, input) => {
    const result = await raw(name, input);
    assert.equal(result.status, 200, JSON.stringify(result.value));
    return result.value;
  };
  const path = fileURLToPath(new URL("../../../agent-runtime/dist/extensions/session-insights/", import.meta.url));
  assert.deepEqual(await call("list_extensions"), []);
  const added = await call("add_extension", { path });
  assert.equal(added[0].id, "isle.session-insights");
  assert.equal(added[0].source, "local");
  assert.equal((await raw("add_extension", { path })).status, 400);
  await call("configure_extension", { id: added[0].id, enabled: false });
  assert.deepEqual(await call("list_extension_ui_contributions"), []);
  await call("configure_extension", { id: added[0].id, enabled: true });
  assert.ok((await call("list_extension_ui_contributions")).some((item) => item.extensionId === added[0].id));
  await call("remove_extension", { id: added[0].id });
  assert.deepEqual(await call("list_extensions"), []);
});

test(
  "bundled plugins are discovered without registration and overrides survive restart",
  { timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "isle-bundled-plugins-"));
    let server;
    t.after(async () => {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    });
    const start = () =>
      startServer({ port: 0, token, runtime: { dataDir: join(root, "data") } });
    server = await start();
    const raw = async (name, input = {}) => {
      const response = await fetch(`${server.url}/api/commands/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ input }),
      });
      return { status: response.status, value: await response.json() };
    };
    const call = async (name, input) => {
      const result = await raw(name, input);
      assert.equal(result.status, 200, JSON.stringify(result.value));
      return result.value;
    };
    const records = await call("list_extensions");
    assert.deepEqual(records.map((item) => item.id).sort(), [
      "isle.collaboration",
      "isle.decisions",
      "isle.session-insights",
      "isle.session-ledger",
    ]);
    assert.equal(records.find((item) => item.id === "isle.collaboration")?.displayName, "角色协作");
    assert.equal(records.find((item) => item.id === "isle.decisions")?.displayName, "智能判断");
    assert.ok(
      records.every(
        (item) => item.source === "bundled" && item.enabled && !item.error,
      ),
    );
    await assert.rejects(readFile(join(root, "data/extensions.json")), {
      code: "ENOENT",
    });
    assert.equal(
      (await raw("remove_extension", { id: "isle.decisions" })).status,
      400,
    );
    const workspace = await call("create_workspace", {
      name: "内置插件测试",
      path: join(root, "workspace"),
    });
    const target = { workspacePath: workspace.path, chatId: "bundled-test" };
    const panel = (await call("list_extension_ui_contributions")).find(
      (item) => item.extensionId === "isle.session-insights",
    );
    assert.equal(panel.extensionId, "isle.session-insights");
    const view = await call("open_extension_view", {
      ...target,
      id: panel.extensionId,
      contributionId: panel.id,
      viewId: panel.view.id,
    });
    assert.match(view.source, /isle.session-insights/);
    const snapshot = await call("query_extension_view", {
      token: view.token,
      method: "session.read",
      requestId: 1,
    });
    assert.deepEqual(snapshot.messages, []);
    assert.deepEqual(snapshot.runs, []);
    assert.equal(snapshot.truncated, false);
    assert.equal(
      (
        await raw("query_extension_view", {
          token: view.token,
          method: "session.read",
          requestId: 1,
          chatId: "other",
        })
      ).status,
      400,
    );
    await call("configure_extension", {
      id: panel.extensionId,
      enabled: false,
    });
    assert.equal(
      (
        await raw("query_extension_view", {
          token: view.token,
          method: "session.read",
          requestId: 1,
        })
      ).status,
      403,
    );
    assert.ok(
      (await call("list_extension_ui_contributions")).every(
        (item) => item.extensionId !== panel.extensionId,
      ),
    );
    await call("configure_extension", { id: panel.extensionId, enabled: true });
    await call("close_extension_view", { token: view.token });
    assert.equal(
      (await call("list_extension_commands", target)).commands.filter(
        (item) => item.id.startsWith("isle.decisions/"),
      ).length,
      4,
    );
    await call("configure_extension", {
      id: "isle.decisions",
      enabled: false,
      config: { rules: [] },
    });
    assert.deepEqual(
      (await call("list_extension_commands", target)).commands.filter(
        (item) => item.id.startsWith("isle.decisions/"),
      ),
      [],
    );
    await server.close();
    server = undefined;
    server = await start();
    const persisted = (await call("list_extensions")).find(
      (item) => item.id === "isle.decisions",
    );
    assert.equal(persisted.enabled, false);
    assert.deepEqual(persisted.config.rules, []);
    await call("configure_extension", { id: "isle.decisions", enabled: true });
    assert.equal(
      (await call("list_extension_commands", target)).commands.filter(
        (item) => item.id.startsWith("isle.decisions/"),
      ).length,
      4,
    );
  },
);
