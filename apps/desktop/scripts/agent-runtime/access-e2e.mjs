import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";
import entries from "../../agent-runtime/build-entries.json" with { type: "json" };

const temp = realpathSync(mkdtempSync(join(tmpdir(), "isle-access-")));
const workspace = join(temp, "workspace"),
  runtime = join(temp, "runtime"),
  data = join(temp, "data");
const workers = [];
let server;
try {
  for (const path of [workspace, runtime, data, join(workspace, "docs"), join(workspace, "out")]) mkdirSync(path);
  writeFileSync(join(workspace, "docs", "allowed.txt"), "allowed");
  writeFileSync(join(workspace, "docs", "private.txt"), "baseline private");
  writeFileSync(join(workspace, "secret.txt"), "outside grant");
  symlinkSync(join(workspace, "secret.txt"), join(workspace, "docs", "escape"));
  symlinkSync(data, join(workspace, "outside"));
  const apiFile = join(runtime, "api.mjs");
  await build({
    stdin: {
      contents: [
        "security/access/index",
        "security/execution/index",
        "security/safety/index",
        "engines/drivers/native/agent/runtimes/pi/tools/safety",
      ]
        .map((name) => `export * from ${JSON.stringify(resolve(`agent-runtime/src/${name}.ts`))};`)
        .join("\n"),
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: apiFile,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const api = await import(pathToFileURL(apiFile));
  const context = { workspacePath: workspace, roots: { pluginData: data } };
  const declaration = {
    filesystem: { read: [{ base: "workspace", path: "docs" }], write: [{ base: "workspace", path: "out" }] },
  };
  const access = api.resolveAgentAccess(declaration, context);
  assert.deepEqual(api.resolveAgentAccess({}, context), {
    filesystem: { read: [], write: [] },
    network: { hosts: [] },
    process: { execute: false },
  });
  for (const invalid of [
    null,
    { unknown: true },
    { filesystem: { delete: [] } },
    { process: { execute: "true" } },
    { network: { hosts: ["https://example.com"] } },
    ...["../escape", "out/../../escape", "/etc", "C:\\Windows", "out/*", "out/../docs", "out\\..\\docs"].map(
      (path) => ({ filesystem: { read: [{ base: "workspace", path }] } }),
    ),
  ]) {
    assert.throws(() => api.resolveAgentAccess(invalid, context));
  }
  assert.throws(() =>
    api.resolveAgentAccess({ filesystem: { read: [{ base: "workspace", path: "outside" }] } }, context),
  );
  assert.throws(() =>
    api.resolveAgentAccess({ filesystem: { read: [{ base: "pluginData" }] } }, { workspacePath: workspace }),
  );
  declaration.filesystem.read.push({ base: "home" });
  assert.equal(access.filesystem.read.length, 1, "resolved grants must not track caller mutation");
  assert.deepEqual(
    api.intersectAccessHosts(["*.example.com", "other.test"], ["api.example.com", "*.sub.example.com", "evil.test"]),
    ["api.example.com", "*.sub.example.com"],
  );
  assert.deepEqual(api.intersectAccessPaths([workspace], [join(workspace, "docs"), data]), [join(workspace, "docs")]);
  for (const mode of ["ask", "auto", "full"]) {
    for (const policy of [api.resolveSafetyPolicy(mode, workspace), null]) {
      for (const [entry, input] of [
        ["read", { path: join(workspace, "secret.txt") }],
        ["write", { path: join(workspace, "docs", "new") }],
        ["read", { path: join(workspace, "docs", "escape") }],
        ["bash", { command: "echo denied" }],
      ]) {
        const result = await api.checkExecution({
          request: { executionId: "denied", entry, input, workspacePath: workspace },
          policy,
          access,
          analyze: api.analyzePiExecution,
          requestApproval: () => assert.fail("approval cannot widen a grant"),
        });
        assert.equal(result.allowed, false);
      }
    }
  }
  const disabled = { ...api.EXECUTION_CONFIG, enabled: false };
  assert.throws(() => api.resolveExecutionPolicy("full", workspace, disabled, runtime, { access }));
  console.log(
    "PASS protocol parsing, path traversal/symlink rejection, immutable grants and hard denial in all modes, including disabled approvals",
  );

  for (const name of [entries.executionHost.output, "vendor"])
    cpSync(resolve("agent-runtime/dist", name), join(runtime, name), { recursive: true });
  writeFileSync(join(runtime, "package.json"), '{"type":"module"}');
  const entry = join(runtime, "worker.mjs");
  await build({
    stdin: {
      contents: `
    import { serveWorker } from ${JSON.stringify(resolve("agent-runtime/src/security/execution/index.ts"))};
    import { readFile, writeFile } from 'node:fs/promises';
    import { execFileSync } from 'node:child_process';
    serveWorker({ async execute(method, input) {
      if (method === 'read') return readFile(input.path, 'utf8');
      if (method === 'write') { await writeFile(input.path, 'written'); return true; }
      if (method === 'fetch') {
        try {
          const response = await fetch(input.url);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return await response.text();
        }
        catch (error) { throw new Error(error.message + ': ' + error.cause?.stack); }
      }
      if (method === 'spawn') return execFileSync(process.execPath, ['-e', input.script], { encoding: 'utf8' });
      return 'ready';
    }, async dispose() {} });
  `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const config = structuredClone(api.EXECUTION_CONFIG);
  config.baseline.denyRead.push(join(workspace, "docs", "private.txt"));
  const start = async (grant) => {
    const worker = new api.ProgramExecutor({
      policy: api.resolveExecutionPolicy("full", workspace, config, runtime, { access: grant }),
      program: { executable: process.execPath, args: [entry] },
    });
    workers.push(worker);
    assert.equal(await worker.call("ready", {}, undefined, undefined, 15_000), "ready");
    return worker;
  };
  let requests = 0;
  server = createServer((_request, response) => {
    requests++;
    response.end("network allowed");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/`;
  const worker = await start(access);
  assert.equal(await worker.call("read", { path: join(workspace, "docs", "allowed.txt") }), "allowed");
  for (const path of [
    join(workspace, "secret.txt"),
    join(workspace, "docs", "private.txt"),
    join(workspace, "docs", "escape"),
  ])
    await assert.rejects(worker.call("read", { path }));
  assert.equal(await worker.call("write", { path: join(workspace, "out", "result.txt") }), true);
  await assert.rejects(worker.call("write", { path: join(workspace, "denied.txt") }));
  await assert.rejects(worker.call("spawn", { script: 'console.log("not allowed")' }), /Access|permission|denied/i);
  await assert.rejects(worker.call("fetch", { url }));
  assert.equal(requests, 0, "denied network requests must not reach the server");
  const executable = api.resolveAgentAccess(
    {
      filesystem: { read: [{ base: "workspace", path: "docs" }], write: [{ base: "workspace", path: "out" }] },
      network: { hosts: ["127.0.0.1"] },
      process: { execute: true },
    },
    context,
  );
  const shellWorker = await start(executable);
  assert.equal(await shellWorker.call("fetch", { url }), "network allowed");
  const readSecret = `require('node:fs').readFileSync(${JSON.stringify(join(workspace, "secret.txt"))}, 'utf8')`;
  await assert.rejects(shellWorker.call("spawn", { script: readSecret }));
  const writeDenied = `require('node:fs').writeFileSync(${JSON.stringify(join(workspace, "denied.txt"))}, 'escape')`;
  await assert.rejects(shellWorker.call("spawn", { script: writeDenied }));
  assert.equal(readFileSync(join(workspace, "out", "result.txt"), "utf8"), "written");
  console.log(
    "PASS real sandbox: allowed/denied reads and writes, baseline deny, symlink, custom-tool process denial, network allowlist and spawned-program containment",
  );
} finally {
  await Promise.all(workers.map((worker) => worker.dispose()));
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  rmSync(temp, { recursive: true, force: true });
}
