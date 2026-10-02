import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createServer } from "vite";
import { startServer } from "../../../server/dist/server.js";
import { webBackendConfig } from "./backend-proxy.mjs";
const desktop = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(new URL("../../../server/test/support/fixtures/runtime.mjs", import.meta.url));
const nativeFetch = globalThis.fetch;
async function bundle(source) {
  const result = await build({
    stdin: { contents: source, resolveDir: desktop },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    tsconfig: join(desktop, "tsconfig.json"),
    plugins: [
      {
        name: "workspace-interaction-test-access",
        setup(build) {
          // Exercise the real workspace listener without mounting the unrelated chat UI.
          build.onResolve(
            {
              filter:
                /^(?:@\/chat\/desktop\/react|@\/workbench\/pages\/chats\/(?:workspace-store|workspace-files)|\.\/chat-service)$/,
            },
            ({ path, importer }) =>
              importer.endsWith("/shell/chat-integration.tsx") ? { path, namespace: "unused-chat-ui" } : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "unused-chat-ui" }, () => ({
            contents:
              "export const DesktopChatEnvironment = undefined, useWorkspaceStore = undefined, useWorkspaceFileStore = undefined, applicationChatHost = undefined, chatService = undefined;",
            loader: "js",
          }));
          build.onLoad({ filter: /[/\\]workbench[/\\]shell[/\\]chat-integration\.tsx$/ }, async ({ path }) => ({
            contents: `${await readFile(path, "utf8")}\nexport { connectWorkspaceInteractions };`,
            loader: "tsx",
          }));
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}#${Math.random()}`
  );
}
async function until(predicate, label) {
  for (let n = 0; n < 500; n++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`Timed out: ${label}`);
}

test("browser APIs use authenticated proxy, real persistence and replayable events", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "mewvis-web-test-")));
  const token = "mewvis-web-integration-private-token";
  const pickerCalls = [];
  let holdPicker = false,
    pickerCanceled = 0;
  const directory = join(root, "application-workspace");
  let server = await startServer({
    nativePicker: async (options, signal) => {
      pickerCalls.push(options);
      if (holdPicker)
        return new Promise((resolve) =>
          signal.addEventListener(
            "abort",
            () => {
              pickerCanceled++;
              resolve(null);
            },
            { once: true },
          ),
        );
      return [directory];
    },
    token,
    port: 0,
    runtime: { dataDir: join(root, "data"), cliPath: fixture },
  });
  const config = webBackendConfig(server.url, token);
  const web = await createServer({
    ...config,
    configFile: false,
    root,
    server: { ...config.server, port: 0, watch: null },
    logLevel: "silent",
  });
  await web.listen();
  const url = web.resolvedUrls.local[0];
  const requests = [];
  const streams = [];
  globalThis.window = {};
  globalThis.fetch = (path, init = {}) => {
    requests.push({ path, init });
    if (path === "/api/events") {
      const abort = new AbortController();
      streams.push(abort);
      init = { ...init, signal: AbortSignal.any([abort.signal, init.signal]) };
    }
    return nativeFetch(new URL(path, url), {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), origin: new URL(url).origin },
    });
  };
  const disposers = [];
  t.after(async () => {
    disposers.forEach((fn) => fn());
    streams.forEach((s) => s.abort());
    globalThis.fetch = nativeFetch;
    delete globalThis.window;
    await web.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  const api = await bundle(`
    export * from "./src/transport/index.ts";
    export * from "./src/transport/events.ts";
    export * from "./src/api/llm.ts";
    export * from "./src/api/workspace.ts";
    export * from "./src/api/workspace-files.ts";
    export * from "./src/api/embedding.ts";
    export * from "./src/api/applications/data.ts";
    export * from "./src/api/native.ts";
    export { connectWorkspaceInteractions } from "./src/workbench/shell/chat-integration.tsx";
    export * from "./src/agent-client/runtime.ts";
  `);
  await t.test("settings and files survive frontend reload; server errors do not become empty data", async () => {
    const settings = await api.saveLlmSettings({
      providers: [
        {
          name: "Web provider",
          provider: "custom",
          apiFormat: "openai-completions",
          apiKey: "test-key",
          isDefault: true,
          models: [{ modelId: "web-model", modelName: "Web model", isOneMillionContext: false }],
        },
      ],
    });
    assert.equal(settings.providers[0].name, "Web provider");
    assert.equal((await api.getLlmSettings({ refresh: true })).providers[0].models[0].modelId, "web-model");
    const workspace = await api.createWorkspace({
      name: "Web workspace",
      path: join(root, "workspace"),
      description: "",
      groupId: "",
    });
    await api.writeWorkspaceFile(workspace.path, "chapter.md", "真实文件\n");
    assert.equal(await readFile(join(workspace.path, "chapter.md"), "utf8"), "真实文件\n");
    const fresh = await bundle('export * from "./src/api/workspace.ts";export * from "./src/api/workspace-files.ts";');
    assert.equal((await fresh.listWorkspaces()).find((w) => w.id === workspace.id).name, "Web workspace");
    assert.equal((await fresh.readWorkspaceFile(workspace.path, "chapter.md")).content, "真实文件\n");
    await assert.rejects(api.readWorkspaceFile(workspace.path, "../outside"));
    await assert.rejects(api.invoke("nonexistent_command"), (error) => error.status === 404);
    assert.deepEqual(await api.listEmbeddingProfiles(), []);
  });
  await t.test("file watcher and Agent subscriptions are established before dispatch", async () => {
    const workspace = (await api.listWorkspaces()).find((w) => w.name === "Web workspace");
    let changed = 0;
    const started = Date.now();
    const stop = await api.watchWorkspaceFiles(workspace.path, () => changed++);
    disposers.push(stop);
    assert.ok(Date.now() - started < 2000, "proxy must flush subscription headers immediately");
    const before = changed;
    await writeFile(join(workspace.path, "external.md"), "external writer");
    await until(() => changed > before, "workspace_files_changed");
    const client = api.createAgentClient();
    const deltas = [];
    const result = await client.agent.chat({
      messages: [{ role: "user", content: "hello" }],
      onTextDelta: (delta) => deltas.push(delta),
    });
    assert.equal(result.text, "fixture");
    await until(() => deltas.join("") === "fixture", "chat stream");
    const events = [];
    disposers.push(await client.events.subscribe((event) => events.push(event)));
    await client.agent.run({
      taskId: "web-task",
      userMessage: "question",
      workspacePath: root,
      sessionRootDir: "sessions/test",
    });
    await until(() => events.some((e) => e.event.type === "question"), "question");
    await client.tasks.answerQuestion({ taskId: "web-task", questionId: "q1", answer: "yes" });
    await until(() => events.some((e) => e.event.type === "done"), "done");
  });
  await t.test("application data and directory confirmation cross the real Node boundary", async () => {
    const sourcePath = join(root, "application");
    await mkdir(sourcePath);
    await writeFile(
      join(sourcePath, "package.json"),
      JSON.stringify({
        name: "@test/web",
        version: "1.0.0",
        type: "module",
        mewvis: {
          app: { version: 1, entry: "index.js" },
          permissions: ["application-data", "application-workspaces"],
          agentAccess: { process: { execute: false } },
        },
      }),
    );
    await writeFile(join(sourcePath, "index.js"), 'export default {name:"web",apply(){}};');
    await api.invoke("install_application", { input: { sourcePath, enable: true } });
    const transport = api.createBackendApplicationDataTransport("@test/web");
    disposers.push(() => transport.dispose());
    const request = (method, params) => transport.request({ version: 1, method, ...(params ? { params } : {}) });
    assert.deepEqual(await request("storage.setItem", { key: "saved", value: { content: "web" } }), {
      ok: true,
      value: null,
    });
    assert.deepEqual(await request("storage.getItem", { key: "saved" }), { ok: true, value: { content: "web" } });
    disposers.push(await api.connectWorkspaceInteractions());
    await mkdir(directory);
    const pending = request("workspaces.create", { name: "Web selected directory" });
    const result = await pending;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.path, directory);
    assert.equal(pickerCalls.at(-1).directory, true);
    transport.dispose();
    assert.equal((await request("storage.keys")).error.code, "PERMISSION_DENIED");
  });
  await t.test("canceling a Web picker closes the native request through the proxy", async () => {
    holdPicker = true;
    const before = pickerCalls.length;
    const abort = new AbortController();
    const selection = api.openSystemDialog({ directory: true }, abort.signal);
    await until(() => pickerCalls.length > before, "native picker waiting");
    abort.abort();
    assert.equal(await selection, null);
    await until(() => pickerCanceled === 1, "proxy forwards cancellation");
    holdPicker = false;
  });
  await t.test("proxy rejects cross-site access and never asks the browser for the bearer token", async () => {
    const response = await nativeFetch(new URL("/api/commands/get_llm_settings", url), {
      method: "POST",
      body: "{}",
      headers: { origin: "https://evil.example" },
    });
    assert.equal(response.status, 403);
    const sameSite = await nativeFetch(new URL("/api/status", url), { headers: { "sec-fetch-site": "same-site" } });
    assert.equal(sameSite.status, 403);
    assert.ok(
      requests.every(({ init }) => !JSON.stringify(Object.fromEntries(new Headers(init.headers))).includes(token)),
    );
  });
  await t.test("SSE reconnect replays missed events once and expired cursors require explicit reload", async () => {
    const values = [];
    disposers.push(await api.listen("probe", ({ payload }) => values.push(payload.n)));
    server.supervisor.events.publish("probe", { n: 1 });
    await until(() => values.length === 1, "first event");
    streams.at(-1).abort();
    await until(() => api.getConnectionState() === "disconnected", "disconnect");
    server.supervisor.events.publish("probe", { n: 2 });
    await until(() => values.length === 2, "replay");
    assert.deepEqual(values, [1, 2]);
    assert.ok(new Headers(requests.filter((r) => r.path === "/api/events").at(-1).init.headers).get("Last-Event-ID"));
    streams.at(-1).abort();
    await until(() => api.getConnectionState() === "disconnected", "second disconnect");
    for (let n = 0; n < 1100; n++) server.supervisor.events.publish("probe", { n });
    await until(() => api.getConnectionState() === "reload-required", "expired cursor notice");
  });
});

test("SSE parser handles every UTF-8 and CRLF split, multiline data and unsubscribe", async () => {
  const { readEvents } = await bundle('export * from "./src/transport/sse.ts";');
  const bytes = new TextEncoder().encode(
    ': heartbeat\r\nid: epoch:1\r\nevent: probe\r\ndata: {"text":\r\ndata: "中文"}\r\n\r\n',
  );
  for (let cut = 1; cut < bytes.length; cut++) {
    const events = [];
    await readEvents(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, cut));
          c.enqueue(bytes.slice(cut));
          c.close();
        },
      }),
      (e) => events.push(e),
    );
    assert.deepEqual(events, [{ id: "epoch:1", name: "probe", payload: { text: "中文" } }]);
  }
});
