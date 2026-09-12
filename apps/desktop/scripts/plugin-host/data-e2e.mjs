import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { createPluginDataClient } from "@isle/plugin-sdk/data";

const temp = realpathSync(mkdtempSync(join(tmpdir(), "isle-plugin-data-")));
try {
  const desktopApi = join(temp, "desktop.mjs");
  await build({
    entryPoints: [resolve("src/api/plugin-data.ts")],
    outfile: desktopApi,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "test-tauri",
        setup(build) {
          build.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: "tauri", namespace: "fixture" }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const invoke = (...args) => globalThis.__dataTauri.invoke(...args); export const isTauri = () => globalThis.__dataTauri.enabled;",
          }));
        },
      },
    ],
  });
  const invoked = [];
  globalThis.__dataTauri = {
    enabled: true,
    async invoke(method, args) {
      invoked.push({ method, args });
      if (method === "connect_plugin_data") {
        if (args.pluginId === "denied") throw { ok: false, error: { code: "PERMISSION_DENIED", message: "denied" } };
        return `binding:${args.pluginId}`;
      }
      if (method === "request_plugin_data") return { ok: true, value: args.connection };
      return null;
    },
  };
  const { createDesktopPluginDataTransport } = await import(pathToFileURL(desktopApi));
  const desktop = createDesktopPluginDataTransport("one");
  const another = createDesktopPluginDataTransport("two");
  const client = createPluginDataClient(desktop);
  assert.deepEqual(await Promise.all([client.storage.getItem("a"), client.storage.getItem("b")]), [
    "binding:one",
    "binding:one",
  ]);
  assert.equal(invoked.filter(({ method }) => method === "connect_plugin_data").length, 1);
  assert.equal(await createPluginDataClient(another).storage.getItem("a"), "binding:two");
  await assert.rejects(createPluginDataClient(createDesktopPluginDataTransport("denied")).storage.keys(), {
    code: "PERMISSION_DENIED",
  });
  desktop.dispose();
  another.dispose();
  await assert.rejects(client.storage.getItem("a"), { code: "PERMISSION_DENIED" });
  assert.ok(
    invoked.some(({ method, args }) => method === "disconnect_plugin_data" && args.connection === "binding:one"),
  );
  globalThis.__dataTauri.enabled = false;
  await assert.rejects(createPluginDataClient(createDesktopPluginDataTransport("preview")).storage.keys(), {
    code: "CAPABILITY_UNAVAILABLE",
  });

  // Execute the actual injected iframe script and reject forged host messages.
  const source = readFileSync(resolve("src/features/pages/plugin-ui/plugin-frame.tsx"), "utf8").match(
    /const BRIDGE_SOURCE = String\.raw`([\s\S]*?)`;/,
  )[1];
  const listeners = new Map(),
    sent = [];
  const parent = {
      postMessage(message) {
        sent.push(message);
      },
    },
    window = {};
  runInNewContext(source, {
    window,
    parent,
    setTimeout,
    clearTimeout,
    addEventListener: (type, callback) => listeners.set(type, callback),
  });
  const iframe = createPluginDataClient(window.islePlugin.data);
  const pending = iframe.storage.getItem("cursor");
  const outgoing = sent.at(-1);
  assert.equal(outgoing.type, "data:request");
  assert.deepEqual(Object.keys(outgoing.request), ["version", "method", "params"]);
  const result = { channel: outgoing.channel, type: "host:result", id: outgoing.id, result: { ok: true, value: 12 } };
  listeners.get("message")({ source: {}, data: { ...result, result: { ok: true, value: "forged" } } });
  listeners.get("message")({ source: parent, data: result });
  assert.equal(await pending, 12);
  const denied = assert.rejects(iframe.storage.clear(), { code: "PERMISSION_DENIED" });
  listeners.get("message")({
    source: parent,
    data: {
      ...result,
      id: sent.at(-1).id,
      result: { ok: false, error: { code: "PERMISSION_DENIED", message: "revoked" } },
    },
  });
  await denied;
  const creating = iframe.workspaces.create({ name: "my workspace" });
  assert.equal(sent.at(-1).request.method, "workspaces.create");
  listeners.get("message")({
    source: parent,
    data: { ...result, id: sent.at(-1).id, result: { ok: true, value: null } },
  });
  assert.equal(await creating, null, "picker cancellation is a successful null response");
  const listing = iframe.workspaces.list();
  const workspace = { id: "workspace-1", name: "default", path: "/workspaces/default", isDefault: true };
  listeners.get("message")({
    source: parent,
    data: { ...result, id: sent.at(-1).id, result: { ok: true, value: [workspace] } },
  });
  assert.deepEqual(await listing, [workspace]);
  console.log("PASS desktop binding lifecycle, preview denial, iframe protocol and forged response rejection");
} finally {
  delete globalThis.__dataTauri;
  rmSync(temp, { recursive: true, force: true });
}
