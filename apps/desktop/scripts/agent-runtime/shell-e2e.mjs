import assert from "node:assert/strict";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "@isle/app-dev/dsh";
import fs from "node:fs";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";
import entries from "../../../agent-runtime/build-entries.json" with { type: "json" };

const temp = fs.mkdtempSync(join(tmpdir(), "isle-shell-"));
const runtime = join(temp, "runtime");
fs.mkdirSync(runtime);
const piRoot = resolve("../agent-runtime/src/engines/drivers/native/agent/runtimes/pi");
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
const resources = [];
const bundleOptions = {
  tsconfig: resolve("../agent-runtime/tsconfig.json"),
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [dshBundleCompatibilityPlugin],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
};
try {
  const bundle = join(runtime, "api.mjs");
  await build({
    ...bundleOptions,
    stdin: {
      contents: [
        "security/platforms/index",
        "security/safety/index",
        "security/execution/index",
        "engines/drivers/native/agent/runtimes/pi/tools/shell",
        "engines/drivers/native/agent/runtimes/pi/tools/safety",
        "engines/drivers/native/agent/runtimes/pi/tools/index",
        "engines/drivers/native/agent/runtimes/pi/tools/subagent",
        "engines/drivers/native/agent/runtimes/pi/agent/subagent-session",
      ]
        .map((file) => `export * from ${JSON.stringify(resolve(`../agent-runtime/src/${file}.ts`))};`)
        .join("\n"),
      loader: "ts",
      resolveDir: process.cwd(),
    },
    outfile: bundle,
  });
  const api = await import(pathToFileURL(bundle).href);
  const existing = new Set();
  const originalExists = fs.existsSync;
  mock.method(fs, "existsSync", (path) =>
    typeof path === "string" && /^C:/i.test(path.replaceAll("\\", "/"))
      ? existing.has(path.toLowerCase())
      : originalExists(path),
  );
  syncBuiltinESMExports();
  const env = { ProgramFiles: "C:\\Program Files", Path: "C:\\Windows\\System32;C:\\Tools", SystemRoot: "C:\\Windows" };
  const select = api.getProcessPlatform("win32").resolveCommandShell;
  const git = "C:\\Program Files\\Git\\bin\\bash.exe";
  const wsl = "C:\\Windows\\System32\\bash.exe";
  const ps = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const pwsh = "C:\\Tools\\pwsh.exe";
  for (const path of [git, wsl, ps, pwsh]) existing.add(path.toLowerCase());
  assert.equal(select(env).executable, git, "native Bash remains preferred");
  existing.delete(git.toLowerCase());
  assert.equal(select(env).executable, pwsh, "WSL launcher must not suppress native PowerShell fallback");
  existing.delete(pwsh.toLowerCase());
  assert.equal(select(env).executable, ps, "system PowerShell works without a PATH entry");
  const msys = "C:\\Tools\\bash.exe";
  existing.add(msys.toLowerCase());
  assert.equal(select(env).executable, msys);
  existing.delete(msys.toLowerCase());
  existing.delete(ps.toLowerCase());
  assert.equal(select(env), undefined, "no usable shell must not be presented as available");
  existing.add(ps.toLowerCase());

  const priorEnv = process.env;
  let powershell;
  try {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env = env;
    powershell = api.createPiShellTool(temp);
  } finally {
    process.env = priorEnv;
    Object.defineProperty(process, "platform", originalPlatform);
  }
  assert.equal(powershell.name, "powershell");
  assert.match(powershell.description, /PowerShell command/);
  let spawned;
  mock.method(childProcess, "spawn", (file, args, options) => {
    spawned = { file, args, options };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("中文 héllo €\n"));
      child.emit("close", 0);
    });
    return child;
  });
  syncBuiltinESMExports();
  const literal = "Write-Output '中文'; $value = \"quotes and $variables\"\nWrite-Output $value";
  const result = await powershell.execute("test", { command: literal });
  assert.equal(spawned.file, ps);
  assert.deepEqual(spawned.args.slice(0, -1), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
  ]);
  assert.ok(spawned.args.at(-1).endsWith(literal), "command must remain one unchanged argv value");
  assert.match(spawned.args.at(-1), /OutputEncoding.*UTF8/);
  assert.equal(spawned.options.detached, false);
  assert.equal(spawned.options.windowsHide, true);
  assert.match(JSON.stringify(result), /中文 héllo €/);
  mock.restoreAll();
  syncBuiltinESMExports();
  console.log("PASS native Bash preference, no-Git PowerShell fallback, WSL exclusion, literal arguments and UTF-8");

  const request = {
    executionId: "shell",
    entry: "powershell",
    workspacePath: temp,
    input: { command: "Remove-Item fixture.txt" },
  };
  const analysis = api.analyzePiExecution(request);
  assert.equal(analysis.coverage, "partial");
  assert.equal(analysis.operations[0].kind, "process");
  let approvals = 0;
  const blocked = await api.checkExecution({
    request,
    policy: api.resolveSafetyPolicy("ask", temp),
    analyze: api.analyzePiExecution,
    requestApproval: async () => {
      approvals++;
      return false;
    },
  });
  assert.equal(approvals, 1);
  assert.equal(blocked.allowed, false);
  assert.ok(api.subagentAllowedTools(["read", "powershell", "subagent"], "worker").includes("powershell"));
  assert.ok(!api.subagentAllowedTools(["read", "powershell"], "scout").includes("powershell"));
  console.log("PASS PowerShell approval and child-role boundaries");

  // A fake executable lets every platform test worker transport and timeout behavior.
  // Actual PowerShell syntax is exercised below only on a Windows host.
  const shim = join(temp, "shell-process.mjs");
  const marker = join(temp, "late-effect");
  fs.writeFileSync(
    shim,
    `import { writeFileSync } from 'node:fs';
    const command = process.argv[2];
    if (command === 'fail') process.exit(7);
    if (command === 'hang') setTimeout(() => writeFileSync(${JSON.stringify(marker)}, 'late'), 2000);
    else console.log('shell-result: ' + command);`,
  );
  await build({
    ...bundleOptions,
    entryPoints: [join(piRoot, "tools/worker.ts")],
    outfile: join(runtime, entries.piToolWorker.output),
    applications: [
      ...bundleOptions.applications,
      {
        name: "powershell-process-fixture",
        setup(builder) {
          builder.onLoad({ filter: /pi[\\/]tools[\\/]shell\.ts$/ }, ({ path }) => {
            const source = fs.readFileSync(path, "utf8");
            const replacement = source.replace(
              "getProcessPlatform().resolveCommandShell()",
              JSON.stringify({
                name: "powershell",
                executable: process.execPath,
                args: [shim],
                commandPrefix: "",
              }),
            );
            assert.notEqual(source, replacement);
            return { contents: replacement, loader: "ts" };
          });
        },
      },
    ],
  });
  fs.copyFileSync(
    resolve("../agent-runtime/dist", entries.executionHost.output),
    join(runtime, entries.executionHost.output),
  );
  const config = structuredClone(api.EXECUTION_CONFIG);
  config.enabled = false;
  const policies = { safety: null, execution: api.resolveExecutionPolicy("full", temp, config) };
  const command = { taskId: "shell-test", workspacePath: temp, resources: {}, permissions: { mode: "full" } };
  const tools = await api.createPiToolSet(command, {}, { policies });
  resources.push(tools);
  assert.ok(!tools.tools.some((tool) => tool.name === "bash"));
  const tool = tools.tools.find((tool) => tool.name === "powershell");
  assert.ok(tool, "default allocation includes the selected PowerShell tool");
  assert.match(JSON.stringify(await tool.execute("run", { command: literal })), /shell-result/);
  await assert.rejects(tool.execute("fail", { command: "fail" }), /code 7/);
  await assert.rejects(tool.execute("timeout", { command: "hang", timeout: 0.2 }), /超时|timeout/i);
  assert.match(JSON.stringify(await tool.execute("restart", { command: "restarted" })), /restarted/);
  const abort = new AbortController();
  let started;
  const start = new Promise((resolve) => {
    started = resolve;
  });
  const pending = tool.execute("cancel", { command: "hang" }, abort.signal, started);
  const rejection = assert.rejects(pending);
  await start;
  abort.abort();
  await rejection;
  const limited = await api.createPiToolSet(
    { ...command, resources: { tools: { allowed: ["read"] } } },
    {},
    { policies },
  );
  resources.push(limited);
  assert.deepEqual(
    limited.tools.map(({ name }) => name),
    ["read"],
  );
  const child = await api.createPiToolSet(command, {}, { policies, subagent: true, toolCeiling: ["read"] });
  resources.push(child);
  assert.deepEqual(
    child.tools.map(({ name }) => name),
    ["read"],
  );
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.equal(fs.existsSync(marker), false, "cancelled/timed-out shells cannot apply a delayed write");
  console.log(
    "PASS PowerShell worker RPC, default/explicit allocation, child ceiling, exit code, timeout and cancellation",
  );

  if (process.platform === "win32") {
    // Force the no-Bash path even on Windows CI machines with Git installed.
    const environment = process.env;
    let native;
    try {
      process.env = { SystemRoot: environment.SystemRoot ?? "C:\\Windows" };
      native = api.createPiShellTool(temp);
    } finally {
      process.env = environment;
    }
    assert.equal(native?.name, "powershell");
    const text = JSON.stringify(
      await native.execute("native", {
        command: "$value = '中文 héllo €'\nWrite-Output $value",
      }),
    );
    assert.match(text, /中文 héllo €/);
    await assert.rejects(native.execute("native-failure", { command: "exit 7" }), /code 7/);
    console.log("PASS native Windows PowerShell execution without Git Bash");
  } else {
    console.log("Windows shell selection and transport verified; native PowerShell execution requires Windows.");
  }
} finally {
  mock.restoreAll();
  syncBuiltinESMExports();
  Object.defineProperty(process, "platform", originalPlatform);
  for (const resource of resources) await resource.dispose();
  fs.rmSync(temp, { recursive: true, force: true });
}
