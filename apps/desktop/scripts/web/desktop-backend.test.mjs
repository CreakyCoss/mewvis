import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createInterface } from "node:readline";

const resources =
  process.env.ISLE_TEST_DESKTOP_RESOURCES ?? fileURLToPath(new URL("../../../agent-runtime/dist/", import.meta.url));
const waitFor = (promise, label, ms = 20_000) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

async function launch(root, runtime, earlyClose = false) {
  const child = spawn(
    join(runtime, process.platform === "win32" ? "node.exe" : "node"),
    [join(runtime, "server/cli.mjs"), "--desktop"],
    {
      cwd: root,
      env: {
        ...process.env,
        ISLE_SERVER_RESOURCES: runtime,
        ISLE_SERVER_DATA_DIR: join(root, "data"),
        ISLE_SERVER_RUNTIME_DATA_DIR: join(root, "data"),
        ISLE_SERVER_RUNTIME_CLI: join(runtime, "cli.js"),
        ISLE_SERVER_TOKEN: "a".repeat(64),
        ISLE_SERVER_PORT: "0",
        AGENT_RUNTIME_PROFILE_ID: "mock",
        ISLE_DESKTOP_DEV_ORIGIN: "http://localhost:1420",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors = (errors + chunk).slice(-8192);
  });
  const exited = once(child, "exit");
  const output = createInterface({ input: child.stdout });
  if (earlyClose) {
    child.stdin.end();
    return { child, exited, output, errors: () => errors };
  }
  try {
    const line = await waitFor(
      Promise.race([
        once(output, "line").then(([line]) => line),
        exited.then(([code]) => {
          throw new Error(`Backend exited ${code}: ${errors}`);
        }),
      ]),
      "readiness",
    );
    return { child, exited, output, ready: JSON.parse(line), errors: () => errors };
  } catch (error) {
    child.stdin.end();
    child.kill();
    throw error;
  }
}

test("packaged desktop backend runs outside the repository, authenticates HTTP/SSE and closes on parent EOF", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle desktop backend "));
  const runtime = join(root, "runtime");
  await cp(resources, runtime, { recursive: true, dereference: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const session = await launch(root, runtime);
  t.after(() => {
    session.child.stdin.end();
    session.child.kill();
    session.output.close();
  });
  const { url, token } = session.ready;
  assert.equal(session.ready.type, "ready");
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(token.length, 64);
  const origin = "tauri://localhost";
  // Real frontend transport: Tauri supplies only connection metadata, never a business command.
  const shellCalls = [];
  const nativeFetch = globalThis.fetch;
  globalThis.__desktopBackendHandshake = async (command) => {
    shellCalls.push(command);
    assert.equal(command, "get_backend_connection");
    return { url, token };
  };
  globalThis.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    return nativeFetch(input, { ...init, headers });
  };
  t.after(() => {
    globalThis.fetch = nativeFetch;
    delete globalThis.__desktopBackendHandshake;
  });
  const desktop = fileURLToPath(new URL("../../", import.meta.url));
  const compiled = await build({
    stdin: {
      contents:
        'export { getLlmSettings } from "./src/api/llm.ts"; export { initializeConfigDatabase } from "./src/api/recovery.ts";',
      resolveDir: desktop,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    tsconfig: join(desktop, "tsconfig.json"),
    plugins: [
      {
        name: "desktop-shell-handshake",
        setup(build) {
          build.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: "shell", namespace: "fixture" }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const isTauri = () => true; export const invoke = (...args) => globalThis.__desktopBackendHandshake(...args);",
          }));
        },
      },
    ],
  });
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
  );
  const [settings, status] = await Promise.all([api.getLlmSettings(), api.initializeConfigDatabase()]);
  assert.ok(Array.isArray(settings.providers));
  assert.equal(status.setupError, null);
  assert.deepEqual(shellCalls, ["get_backend_connection"]);
  globalThis.fetch = nativeFetch;

  let response = await fetch(`${url}/api/commands/get_llm_settings`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  response = await fetch(`${url}/api/status`, { headers: { origin } });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  for (const denied of ["https://evil.example", "http://localhost:9999", "null"]) {
    response = await fetch(`${url}/api/status`, { headers: { origin: denied, authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  response = await fetch(`${url}/api/commands/get_llm_settings`, {
    method: "POST",
    headers: { origin, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.ok(Array.isArray((await response.json()).providers));
  const invokeBackend = async (name, input) => {
    const result = await fetch(`${url}/api/commands/${name}`, {
      method: "POST",
      headers: { origin, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const value = await result.json();
    assert.equal(result.status, 200, JSON.stringify(value));
    return value;
  };
  const workspace = await invokeBackend("create_workspace", { name: "Desktop runtime", path: join(root, "project") });
  await invokeBackend("run_agent_runtime_agent", {
    taskId: "desktop-runtime",
    workspacePath: workspace.path,
    sessionRootDir: "sessions/desktop",
    agentRoleId: "test",
    userMessage: "Offline desktop backend",
  });
  let task;
  for (let attempt = 0; attempt < 300; attempt++) {
    task = await (
      await fetch(`${url}/api/tasks/desktop-runtime`, { headers: { origin, authorization: `Bearer ${token}` } })
    ).json();
    if (["done", "failed"].includes(task.taskState)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(task.taskState, "done", JSON.stringify(task));
  const runtimeStatus = await (
    await fetch(`${url}/api/status`, { headers: { origin, authorization: `Bearer ${token}` } })
  ).json();
  const workerPid = runtimeStatus.workers[0]?.pid;
  assert.ok(workerPid, "real packaged Runtime worker is running");
  const abort = new AbortController();
  response = await fetch(`${url}/api/events`, {
    headers: { origin, authorization: `Bearer ${token}` },
    signal: abort.signal,
  });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("x-event-cursor"));
  assert.equal(response.headers.get("access-control-expose-headers"), "x-event-cursor");
  abort.abort();
  session.child.stdin.end();
  assert.equal((await waitFor(session.exited, "graceful shutdown"))[0], 0, session.errors());
  assert.throws(() => process.kill(workerPid, 0), { code: "ESRCH" });
  assert.ok(!session.errors().includes(token), "credential must stay in the private handshake");
  const restarted = await launch(root, runtime, true);
  assert.equal((await waitFor(restarted.exited, "parent exits during startup"))[0], 0, restarted.errors());
  restarted.output.close();
});
