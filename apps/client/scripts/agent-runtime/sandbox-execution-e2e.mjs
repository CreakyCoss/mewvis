import assert from "node:assert/strict";
import { build } from "esbuild";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";
import entries from "../../../agent-runtime/build-entries.json" with { type: "json" };
const temp = mkdtempSync(join(tmpdir(), "isle-tool-sandbox-"));
const workspace = join(temp, "workspace"),
  runtime = join(temp, "runtime");
mkdirSync(workspace);
mkdirSync(runtime);
let server;
const workers = [];
try {
  for (const name of [entries.executionHost.output, entries.piToolWorker.output, "vendor", "builtins"])
    cpSync(resolve("../agent-runtime/dist", name), join(runtime, name), { recursive: true });
  writeFileSync(
    join(runtime, "package.json"),
    JSON.stringify({ type: "module", piConfig: { name: "pi", configDir: ".pi" } }),
  );
  await build({
    stdin: {
      contents: `export * from ${JSON.stringify(resolve("../agent-runtime/src/security/execution/index.ts"))};`,
      loader: "ts",
      resolveDir: process.cwd(),
    },
    outfile: join(runtime, "api.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const api = await import(pathToFileURL(join(runtime, "api.mjs")).href);
  const privatePath = join(temp, "private");
  mkdirSync(privatePath);
  writeFileSync(join(privatePath, "secret"), "must stay private");
  const config = structuredClone(api.EXECUTION_CONFIG);
  config.backend.platforms.windows.readGrantPaths.push(resolve("../.."));
  config.baseline.denyRead.push(privatePath);
  config.baseline.denyWrite.push(privatePath);

  const genericEntry = join(runtime, "independent-worker.mjs");
  const genericBuild = await build({
    stdin: {
      contents: `
        import { serveWorker } from ${JSON.stringify(resolve("../agent-runtime/src/security/execution/index.ts"))};
        import { readFile, writeFile } from 'node:fs/promises';
        let startupBlocked = false;
        let disposals = 0;
        try { await readFile(${JSON.stringify(join(privatePath, "secret"))}); } catch { startupBlocked = true; }
        console.log(JSON.stringify({ id: 1, result: 'diagnostics must not become RPC' }));
        serveWorker({
          async execute(method, input, context) {
            if (method === 'inspect') {
              context.progress('independent worker ready');
              return { pid: process.pid, entryArgument: process.argv[2], startupBlocked };
            }
            if (method === 'read') return readFile(input.path, 'utf8');
            if (method === 'write') { await writeFile(input.path, input.content); return 'written'; }
            if (method === 'hang') {
              context.progress('started');
              await new Promise(resolve => setTimeout(resolve, 20_000));
              await writeFile(input.path, 'late effect');
              return null;
            }
            throw new Error('unknown fixture operation');
          },
          async dispose() {
            await writeFile(${JSON.stringify(join(workspace, "independent-dispose.txt"))}, String(++disposals));
          },
        });
      `,
      loader: "ts",
      resolveDir: process.cwd(),
    },
    outfile: genericEntry,
    bundle: true,
    platform: "node",
    format: "esm",
    metafile: true,
  });
  assert.ok(
    Object.keys(genericBuild.metafile.inputs).every(
      (path) =>
        !path.includes("/runtimes/") && !path.includes("pi-coding-agent") && !path.includes("/security/safety/"),
    ),
    "execution must not depend on an Agent SDK, adapter or pre-call safety implementation",
  );
  const independent = new api.ProgramExecutor({
    policy: api.resolveExecutionPolicy("auto", workspace, api.validateExecutionConfig(config), runtime),
    program: { executable: process.execPath, args: [genericEntry, "injected-entry"] },
  });
  workers.push(independent);
  const progress = [];
  const inspected = await independent.call("inspect", {}, undefined, (event) => progress.push(event), 60_000);
  assert.notEqual(inspected.pid, process.pid);
  assert.equal(inspected.entryArgument, "injected-entry");
  assert.equal(inspected.startupBlocked, true);
  assert.deepEqual(progress, ["independent worker ready"]);
  await independent.call("write", { path: join(workspace, "independent.txt"), content: "generic executor" });
  assert.equal(readFileSync(join(workspace, "independent.txt"), "utf8"), "generic executor");
  await assert.rejects(independent.call("read", { path: join(privatePath, "secret") }));
  await assert.rejects(independent.call("write", { path: join(privatePath, "blocked"), content: "no" }));
  const disposing = independent.dispose();
  await assert.rejects(independent.call("inspect", {}), /已关闭/);
  await Promise.all([disposing, independent.dispose()]);
  await independent.dispose();
  assert.equal(readFileSync(join(workspace, "independent-dispose.txt"), "utf8"), "1");
  assert.equal(independent.disposed, true);
  console.log("PASS injected non-Pi program: isolated module startup, RPC/progress, file boundaries and cleanup");

  for (const [field, value, message] of [
    ["version", "0.0.0", /版本.*不一致/],
    ["name", "missing", /不支持的沙箱后端/],
  ]) {
    const incompatible = structuredClone(config);
    incompatible.backend[field] = value;
    const rejected = new api.ProgramExecutor({
      policy: api.resolveExecutionPolicy("auto", workspace, incompatible, runtime),
      program: { executable: process.execPath, args: [genericEntry] },
    });
    workers.push(rejected);
    await assert.rejects(rejected.call("inspect", {}, undefined, undefined, 15_000), message);
    await rejected.dispose();
  }
  console.log("PASS execution rejects incompatible or unknown backends without starting the worker");

  const failedStartup = new api.ProgramExecutor({
    policy: api.resolveExecutionPolicy("auto", workspace, api.validateExecutionConfig(config), runtime),
    program: { executable: process.execPath, args: [join(runtime, "missing-worker.mjs")] },
  });
  workers.push(failedStartup);
  await assert.rejects(failedStartup.call("inspect", {}, undefined, undefined, 60_000), /missing-worker|进程退出/);
  assert.equal(failedStartup.disposed, true);
  await failedStartup.dispose();
  console.log("PASS startup failure rejects pending calls and closes the executor");

  const directConfig = structuredClone(config);
  directConfig.enabled = false;
  directConfig.backend.options.protectedFileNames = [];
  for (const reason of ["cancel", "timeout"]) {
    const direct = new api.ProgramExecutor({
      policy: api.resolveExecutionPolicy("ask", workspace, api.validateExecutionConfig(directConfig), runtime),
      program: { executable: process.execPath, args: [genericEntry, "ordinary-process"] },
    });
    workers.push(direct);
    assert.equal((await direct.call("inspect", {}, undefined, undefined, 10_000)).startupBlocked, false);
    assert.equal(await direct.call("read", { path: join(privatePath, "secret") }), "must stay private");
    const controller = new AbortController();
    let running;
    const started = new Promise((resolve) => {
      running = resolve;
    });
    const target = join(workspace, `direct-${reason}`);
    const waiting = assert.rejects(
      direct.call("hang", { path: target }, controller.signal, running, reason === "timeout" ? 100 : 0),
      reason === "timeout" ? /超时/ : /取消/,
    );
    if (reason === "cancel") {
      await started;
      controller.abort();
    }
    await waiting;
    await direct.dispose();
    assert.equal(existsSync(target), false);
  }
  const mismatch = new api.ProgramExecutor({
    policy: api.resolveExecutionPolicy(
      "ask",
      workspace,
      api.validateExecutionConfig({ ...directConfig, enabled: true }),
      runtime,
    ),
    program: { executable: process.execPath, args: [genericEntry] },
  });
  workers.push(mismatch);
  await assert.rejects(mismatch.call("inspect", {}, undefined, undefined, 10_000), /基础限制/);
  await mismatch.dispose();
  console.log(
    "PASS ordinary execution skips SRT, retains cancellation/timeouts, and is never a startup-failure fallback",
  );

  const open = async (mode, resources = {}, executionConfig = config) => {
    const policy = api.resolveExecutionPolicy(mode, workspace, api.validateExecutionConfig(executionConfig), runtime);
    const executor = new api.ProgramExecutor({
      policy,
      program: { executable: process.execPath, args: [join(runtime, entries.piToolWorker.output)] },
    });
    workers.push(executor);
    const catalog = await executor.call(
      "initialize",
      { workspacePath: workspace, resources },
      undefined,
      undefined,
      60_000,
    );
    return {
      executor,
      catalog,
      policy,
      call: (name, args, signal, timeout) =>
        executor.call("execute", { callId: "test", name, arguments: args }, signal, undefined, timeout),
    };
  };
  for (const mode of ["ask", "auto", "full"]) {
    const tool = await open(mode);
    assert.ok(tool.catalog.tools.some((tool) => tool.name === "write"));
    await tool.call("write", { path: "ok.txt", content: mode });
    assert.equal(readFileSync(join(workspace, "ok.txt"), "utf8"), mode);
    await assert.rejects(tool.call("read", { path: join(privatePath, "secret") }));
    await assert.rejects(tool.call("write", { path: join(privatePath, "forbidden"), content: "no" }));
    const bash = await tool
      .call("bash", { command: `cat '${privatePath.replaceAll("\\", "/").replaceAll("'", "'\\''")}/secret'` })
      .catch((error) => ({ error: error.message }));
    assert.ok(!JSON.stringify(bash).includes("must stay private"));
    await assert.rejects(tool.call("write", { path: ".git/hooks/pre-commit", content: "no" }));
    assert.equal(existsSync(join(workspace, ".git/hooks/pre-commit")), false);
    await tool.executor.dispose();
  }
  console.log("PASS all three profiles isolate file tools and Bash; full keeps shared restrictions");
  const builtin = await open("auto", { skills: { enabled: ["story-assistant"] } });
  assert.ok(builtin.catalog.tools.some((tool) => tool.name === "story"));
  const initialized = await builtin.call("story", {
    action: "initialize",
    storyId: "sandbox-story",
    title: "Sandbox story",
  });
  assert.equal(initialized.details.initialized, true, JSON.stringify(initialized));
  assert.ok(existsSync(join(workspace, "story/.isle-claw/project.json")));
  await builtin.executor.dispose();
  console.log("PASS builtin business tools initialize and write through the isolated executor");

  let releaseTransaction;
  const entered = [];
  const first = api.serializeWorkspaceOperation(workspace, undefined, async () => {
    entered.push("first");
    await new Promise((resolve) => {
      releaseTransaction = resolve;
    });
  });
  while (!releaseTransaction) await new Promise((resolve) => setImmediate(resolve));
  const cancelledTransaction = new AbortController();
  const cancelled = api.serializeWorkspaceOperation(workspace, cancelledTransaction.signal, async () =>
    entered.push("cancelled"),
  );
  const rejection = assert.rejects(cancelled);
  cancelledTransaction.abort();
  await rejection;
  const next = api.serializeWorkspaceOperation(workspace, undefined, async () => entered.push("next"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(entered, ["first"]);
  releaseTransaction();
  await Promise.all([first, next]);
  assert.deepEqual(entered, ["first", "next"]);
  console.log("PASS builtin transaction ordering survives worker separation and queued cancellation");

  let hits = 0;
  server = createServer((_, response) => {
    hits++;
    response.end("network-ok");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const command = `curl --fail --max-time 3 http://127.0.0.1:${server.address().port}`;
  for (const mode of ["ask", "auto", "full"]) {
    const tool = await open(mode);
    assert.equal(tool.policy.sandbox.network.allow, "all");
    assert.match(
      JSON.stringify(await tool.call("bash", { command })),
      /network-ok/,
      `${mode} sandbox should allow network independently of pre-call approval`,
    );
    await tool.executor.dispose();
  }
  assert.equal(hits, 3);
  hits = 0;
  console.log("PASS all three sandbox profiles allow network while retaining filesystem isolation");

  const restrictedConfig = structuredClone(config);
  restrictedConfig.profiles.find((profile) => profile.mode === "auto").network.deny = ["127.0.0.1"];
  const restricted = await open("auto", {}, restrictedConfig);
  let full;
  if (process.platform === "win32") {
    await assert.rejects(open("full"), /不同的文件或网络范围/);
  } else full = await open("full");
  await assert.rejects(restricted.call("write", { path: ".env", content: "blocked" }));
  await assert.rejects(restricted.call("bash", { command }));
  assert.equal(hits, 0);
  if (process.platform === "win32") {
    await restricted.executor.dispose();
    full = await open("full");
    const samePolicy = await open("full");
    await samePolicy.executor.dispose();
  }
  await full.call("write", { path: ".env", content: "configured" });
  assert.equal(readFileSync(join(workspace, ".env"), "utf8"), "configured");
  const result = await full.call("bash", { command });
  assert.match(JSON.stringify(result), /network-ok/);
  assert.equal(hits, 1);
  if (process.platform !== "win32") {
    await assert.rejects(restricted.call("bash", { command }));
    assert.equal(hits, 1, "concurrent executors must not share a permissive proxy");
  } else await assert.rejects(open("auto"), /不同的文件或网络范围/);
  console.log("PASS configured write/network boundaries and supported concurrent policy scopes");
  const applicationRoot = join(workspace, "application");
  mkdirSync(applicationRoot);
  const sdk = pathToFileURL(resolve("../../packages/app/sdk/index.js")).href;
  writeFileSync(
    join(applicationRoot, "package.json"),
    JSON.stringify({ type: "module", name: "sandbox-fixture", main: "./index.js" }),
  );
  writeFileSync(
    join(applicationRoot, "index.js"),
    `
    import { defineApplication, defineTool } from ${JSON.stringify(sdk)};
    import { readFile, writeFile } from 'node:fs/promises';
    console.log(JSON.stringify({id:1,result:'application stdout is not RPC'}));
    let startupBlocked = false;
    try { await readFile(${JSON.stringify(join(privatePath, "secret"))}); } catch { startupBlocked = true; }
    export default defineApplication({ name: 'sandbox-fixture', inject: ['tools'], apply(ctx) {
      ctx.tools.register(defineTool({ name: 'fixture_effect', risk: 'low', description: 'Exercise native Node effects.',
        parameters: { type: 'object', properties: { action: { type: 'string' }, target: { type: 'string' } }, required: ['action'] },
        output: { schema: {}, render: (_args, value) => [{type:'text',text:JSON.stringify(value)}] },
        async execute(args) {
          if (args.action === 'read') return await readFile(args.target, 'utf8');
          if (args.action === 'write') { await writeFile(args.target, 'application'); return 'written'; }
          if (args.action === 'network') return await (await fetch(args.target)).text();
          return { pid: process.pid, startupBlocked, hasSecret: Boolean(process.env.ISLE_TEST_SECRET) };
        }
      }));
    }});
  `,
  );
  process.env.ISLE_TEST_SECRET = "must-not-inherit";
  const applications = {
    applications: {
      items: [{ kind: "isle", id: "sandbox-fixture", packageRoot: applicationRoot, entry: join(applicationRoot, "index.js") }],
    },
  };
  const application = await open("full", applications);
  delete process.env.ISLE_TEST_SECRET;
  const meta = await application.call("fixture_effect", { action: "meta" });
  assert.notEqual(meta.details.value.pid, process.pid);
  assert.equal(meta.details.value.startupBlocked, true, "module initialization is isolated too");
  assert.equal(meta.details.value.hasSecret, false);
  await assert.rejects(application.call("fixture_effect", { action: "read", target: join(privatePath, "secret") }));
  await assert.rejects(application.call("fixture_effect", { action: "write", target: join(privatePath, "application-write") }));
  const fetched = await application.call("fixture_effect", {
    action: "network",
    target: `http://127.0.0.1:${server.address().port}`,
  });
  assert.match(JSON.stringify(fetched), /network-ok/);
  console.log("PASS application module initialization, native fs/fetch, IPC separation and environment isolation");

  const abort = new AbortController();
  const sleep = full.call("bash", { command: "sleep 20; touch late-effect" }, abort.signal);
  const sleepRejection = assert.rejects(sleep, /取消/);
  abort.abort();
  await sleepRejection;
  await full.executor.dispose();
  assert.equal(existsSync(join(workspace, "late-effect")), false);
  const timeout = await open("full");
  await assert.rejects(timeout.call("bash", { command: "sleep 20; touch late-timeout" }, undefined, 100), /超时/);
  await timeout.executor.dispose();
  assert.equal(existsSync(join(workspace, "late-timeout")), false);
  console.log("PASS cancellation and timeout terminate the sandbox execution tree");
  await application.executor.dispose();
  const afterCleanup = await open("auto", applications);
  await assert.rejects(afterCleanup.call("write", { path: ".env", content: "blocked-again" }));
  await assert.rejects(afterCleanup.call("fixture_effect", { action: "write", target: join(workspace, ".env") }));
  await afterCleanup.call("fixture_effect", { action: "write", target: join(workspace, "declared-risk.txt") });
  assert.equal(readFileSync(join(workspace, "declared-risk.txt"), "utf8"), "application");
  assert.match(JSON.stringify(await afterCleanup.call("bash", { command })), /network-ok/);
  await afterCleanup.executor.dispose();
  console.log("PASS cleanup permits a restricted session after full sessions finish");
} finally {
  delete process.env.ISLE_TEST_SECRET;
  await Promise.allSettled(workers.map((worker) => worker.dispose()));
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  rmSync(temp, { recursive: true, force: true });
}
