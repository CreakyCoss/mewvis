import assert from "node:assert/strict";
import { build } from "esbuild";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import entries from "../../agent-runtime/build-entries.json" with { type: "json" };
const temp = realpathSync(mkdtempSync(join(tmpdir(), "isle-platform-test-")));
const children = [];
try {
  const bundle = join(temp, "api.mjs");
  await build({
    stdin: {
      contents: [
        ...[
          "security/platforms/resources",
          "security/platforms/index",
          "security/platforms/windows/policy-lease",
          "security/platforms/windows/policy",
          "security/execution/index",
        ].map((name) => `export * from ${JSON.stringify(resolve(`agent-runtime/src/${name}.ts`))};`),
      ].join("\n"),
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: bundle,
    banner: {
      js: "import { createRequire as __runtimeCreateRequire } from 'node:module'; const require = __runtimeCreateRequire(import.meta.url);",
    },
    bundle: true,
    format: "esm",
    platform: "node",
  });
  const api = await import(pathToFileURL(bundle).href);
  const winPaths = api.getPathPlatform("win32");
  const unixPaths = api.getPathPlatform("linux");
  for (const value of ["C:\\Users\\name", "C:/Users/name", "\\\\server\\share\\dir"])
    assert.equal(winPaths.isAbsolutePath(value), true);
  for (const value of ["C:relative", "\\relative", "/relative", "\\\\server", "\\\\.\\pipe\\name", "\\\\?\\C:\\name"])
    assert.equal(winPaths.isAbsolutePath(value), false, value);
  assert.equal(api.containsPath("C:\\Users\\Name", "c:/users/name/project/file", "win32"), true);
  assert.equal(api.containsPath("C:\\Users\\Name", "C:\\Users\\Name-other", "win32"), false);
  assert.equal(api.containsPath("C:\\Users", "D:\\Users", "win32"), false);
  assert.equal(api.containsPath("\\\\server\\share", "\\\\SERVER\\SHARE\\dir", "win32"), true);
  assert.equal(api.containsPath("\\\\server\\share", "\\\\server\\other\\dir", "win32"), false);
  assert.equal(api.containsPath("/home/User", "/home/user/file", "linux"), false);
  assert.equal(api.containsPath("/home/user", "/home/user/../other", "darwin"), false);
  assert.equal(unixPaths.preserveResourcePath("/dev/null"), true);
  assert.equal(winPaths.preserveResourcePath("/dev/null"), false);
  assert.deepEqual(unixPaths.resourceVariables(), {});
  assert.ok(winPaths.resourceVariables().programData);
  assert.throws(() => api.getPathPlatform("freebsd"), /不支持/);
  console.log("PASS shared platform paths: Windows drives/UNC/case and POSIX resource semantics");
  const disabledControl = join(temp, "disabled-control.mjs");
  await build({
    entryPoints: [resolve("agent-runtime/src/security/execution/cli/control.ts")],
    outfile: disabledControl,
    bundle: true,
    format: "esm",
    platform: "node",
    plugins: [
      {
        name: "disabled-sandbox-config",
        setup(builder) {
          builder.onLoad({ filter: /execution[\\/]policy\.ts$/ }, ({ path }) => {
            const source = readFileSync(path, "utf8");
            const disabled = source.replace(/(["']?enabled["']?\s*:\s*)true/, "$1false");
            assert.notEqual(source, disabled, "fixture must disable the execution policy");
            return { contents: disabled, loader: "ts" };
          });
        },
      },
    ],
  });
  const status = JSON.parse(execFileSync(process.execPath, [disabledControl, "status"], { encoding: "utf8" }));
  assert.equal(status.state, "disabled");
  assert.equal(status.canInstall, false);
  assert.equal(
    JSON.parse(execFileSync(process.execPath, [disabledControl, "install"], { encoding: "utf8" })).state,
    "disabled",
  );
  const independentConfig = structuredClone(api.EXECUTION_CONFIG);
  independentConfig.profiles.push({ ...structuredClone(independentConfig.profiles[2]), mode: "custom" });
  const snapshot = api.resolveExecutionPolicy("custom", temp, independentConfig);
  const encoded = JSON.stringify(snapshot);
  assert.deepEqual(JSON.parse(encoded), snapshot, "execution snapshots must survive JSON worker transport");
  assert.deepEqual(structuredClone(snapshot), snapshot);
  independentConfig.profiles[3].filesystem.allowWrite.length = 0;
  independentConfig.backend.options.protectedFileNames.length = 0;
  independentConfig.environment.length = 0;
  assert.equal(JSON.stringify(snapshot), encoded, "resolved snapshots must not share mutable config data");
  assert.throws(() => api.validateExecutionConfig({ ...api.EXECUTION_CONFIG, unexpected: true }));
  assert.throws(
    () =>
      api.validateExecutionConfig({
        ...api.EXECUTION_CONFIG,
        profiles: [...api.EXECUTION_CONFIG.profiles, api.EXECUTION_CONFIG.profiles[0]],
      }),
    /不可重复/,
  );
  assert.throws(
    () =>
      api.validateExecutionConfig({
        ...api.EXECUTION_CONFIG,
        backend: { ...api.EXECUTION_CONFIG.backend, options: { callback() {} } },
      }),
    "functions cannot enter the execution config or snapshot",
  );
  assert.throws(() => api.resolveExecutionPolicy("missing", temp), /未配置/);
  assert.throws(
    () =>
      api.resolveExecutionPolicy("auto", temp, {
        ...api.EXECUTION_CONFIG,
        backend: {
          ...api.EXECUTION_CONFIG.backend,
          options: { ...api.EXECUTION_CONFIG.backend.options, platform: {} },
        },
      }),
    /保留字段/,
    "platform parameters must not silently overwrite a configured backend option",
  );
  const disabledConfig = {
    ...api.EXECUTION_CONFIG,
    enabled: false,
    backend: { name: "missing", version: "none", options: {}, platforms: {} },
  };
  assert.equal(api.resolveExecutionPolicy("missing", temp, disabledConfig).sandbox, null);
  for (const control of [api.getSandboxStatus, api.installSandbox]) {
    assert.equal(
      (await control({ config: disabledConfig })).state,
      "disabled",
      "disabled control skips backend resolution",
    );
    const wrongVersion = structuredClone(api.EXECUTION_CONFIG);
    wrongVersion.backend.version = "0.0.0";
    api.validateExecutionConfig(wrongVersion); // Generic parsing has no hard-coded SDK version.
    const incompatible = await control({ config: wrongVersion });
    assert.equal(incompatible.state, "unavailable");
    assert.equal(incompatible.canInstall, false);
    assert.match(incompatible.message, /版本.*不一致/);
    const unknownBackend = structuredClone(api.EXECUTION_CONFIG);
    unknownBackend.backend.name = "missing";
    assert.match((await control({ config: unknownBackend })).message, /不支持的沙箱后端/);
  }
  if (process.platform !== "win32") {
    const invalidScratch = structuredClone(api.EXECUTION_CONFIG);
    invalidScratch.backend.platforms.posix.temporaryDirectory = temp;
    assert.equal(
      (await api.getSandboxStatus({ config: invalidScratch })).state,
      "unavailable",
      "status detects the same platform compatibility constraints as startup",
    );
  }
  const windowsVariables = {
    workspace: "C:/Workspace",
    home: "C:/Users/Name",
    runtime: "C:/Runtime",
    temp: "C:/Temp",
    nodeDirectory: "C:/Node",
    programData: "C:/ProgramData",
    arch: "x64",
  };
  const windowsPath = (value) =>
    winPaths.path.normalize(value.replace(/\$\{([^}]+)\}/g, (_, key) => windowsVariables[key]));
  const resolvedWindows = api.resolveExecutionBackend(api.EXECUTION_CONFIG.backend, windowsPath, "win32");
  assert.equal(resolvedWindows.backend.options.platform.kind, "windows");
  assert.deepEqual(resolvedWindows.systemWritePaths, []);
  assert.equal(resolvedWindows.backend.options.platform.srtWinPath, "C:\\Runtime\\vendor\\srt-win\\x64\\srt-win.exe");
  assert.equal(
    resolvedWindows.backend.options.platform.policyStore,
    "C:\\ProgramData\\sandbox-runtime\\isle-policy.sqlite",
  );
  const invalidWindows = structuredClone(api.EXECUTION_CONFIG.backend);
  invalidWindows.platforms.windows.proxyPortRange = [60089, 60080];
  assert.throws(() => api.resolveExecutionBackend(invalidWindows, windowsPath, "win32"), /端口范围/);
  invalidWindows.platforms.windows.proxyPortRange = [60080, 60089];
  invalidWindows.platforms.windows.srtWinPath = "${workspace}/srt-win.exe";
  assert.throws(() => api.resolveExecutionBackend(invalidWindows, windowsPath, "win32"), /程序位置/);
  console.log(
    "PASS serializable snapshots, generic config validation, shared status/install flow and platform parameter resolution",
  );
  const windows = api.getProcessPlatform("win32");
  const posix = api.getProcessPlatform("darwin");
  assert.throws(() => api.getProcessPlatform("freebsd"), /不支持/);
  assert.deepEqual(
    windows.executionEnvironment(["PATH", "SystemRoot", "ProgramFiles(x86)"], {
      Path: "C:\\tools",
      SYSTEMROOT: "C:\\Windows",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      SECRET: "private",
    }),
    { PATH: "C:\\tools", SystemRoot: "C:\\Windows", "ProgramFiles(x86)": "C:\\Program Files (x86)" },
  );
  assert.deepEqual(posix.executionEnvironment(["PATH"], { Path: "wrong", PATH: "right" }), { PATH: "right" });
  assert.throws(() => windows.quoteArgument("bad\0argument"));
  assert.equal(windows.quoteArgument("C:\\O'Brien\\worker.js"), "'C:\\O''Brien\\worker.js'");
  const windowsCommand = windows.programCommand(
    { executable: "C:\\Program Files\\node.exe", args: ["C:\\O'Brien\\worker.js"] },
    ["--isle-token", "abc"],
    "C:\\Temp",
  );
  assert.ok(windowsCommand.includes("& 'C:\\Program Files\\node.exe' 'C:\\O''Brien\\worker.js'"));
  if (process.platform !== "win32") {
    const script = join(temp, "O'Brien worker.mjs");
    writeFileSync(script, "console.log(JSON.stringify(process.argv.slice(2)))");
    const args = ['spaces and "quotes"', "$HOME; $(whoami) `id`", "O'Brien"];
    const output = execFileSync(
      "/bin/bash",
      ["-c", posix.programCommand({ executable: process.execPath, args: [script, ...args] }, [], temp)],
      {
        encoding: "utf8",
      },
    );
    assert.deepEqual(JSON.parse(output), args);
  }
  for (const mode of ["ask", "auto", "full"])
    assert.equal(api.resolveExecutionPolicy(mode, temp).sandbox.network.allow, "all");
  const full = api.resolveExecutionPolicy("full", temp).sandbox;
  assert.deepEqual(api.EXECUTION_CONFIG.profiles.find((p) => p.mode === "full").filesystem.allowWrite, [
    "${workspace}",
    "${home}",
    "${temp}",
  ]);
  assert.notEqual(api.policyFingerprint(full), api.policyFingerprint(api.resolveExecutionPolicy("auto", temp).sandbox));
  assert.equal(
    api.policyFingerprint(api.resolveExecutionPolicy("ask", temp).sandbox),
    api.policyFingerprint(api.resolveExecutionPolicy("auto", temp).sandbox),
    "approval thresholds do not change OS resource scope",
  );
  console.log("PASS platform environment, literal command arguments and shared profile resolution");

  const aclWorkspace = join(temp, "acl-workspace");
  mkdirSync(aclWorkspace);
  const windowsPolicy = api.resolveExecutionPolicy(
    "auto",
    aclWorkspace,
    api.EXECUTION_CONFIG,
    join(temp, "runtime"),
  ).sandbox;
  windowsPolicy.backend.options.platform = {
    ...api.EXECUTION_CONFIG.backend.platforms.windows,
    kind: "windows",
    temporaryDirectory: temp,
    readGrantPaths: [aclWorkspace],
    mandatorySearchDepth: 0,
  };
  const acl = api.windowsFilesystem(windowsPolicy);
  assert.ok(acl.denyWrite.includes(join(aclWorkspace, ".git")));
  assert.ok(
    !acl.denyWrite.includes(join(aclWorkspace, ".git/hooks")),
    "a missing .git denial must not conflict with a nested placeholder",
  );
  const worktree = structuredClone(windowsPolicy);
  worktree.filesystem.denyWrite = [];
  writeFileSync(join(aclWorkspace, ".git"), "gitdir: ../repo/.git/worktrees/test");
  assert.ok(
    !api.windowsFilesystem(worktree).denyWrite.includes(join(aclWorkspace, ".git/hooks")),
    "a worktree marker cannot have filesystem children",
  );
  rmSync(join(aclWorkspace, ".git"));
  windowsPolicy.filesystem.denyRead = [aclWorkspace, join(aclWorkspace, "private")];
  windowsPolicy.filesystem.allowWrite = [join(aclWorkspace, "nested")];
  windowsPolicy.backend.options.platform.readGrantPaths = [join(aclWorkspace, "nested")];
  const denied = api.windowsFilesystem(windowsPolicy);
  assert.deepEqual(denied.denyRead, [aclWorkspace]);
  assert.deepEqual(denied.allowRead, [], "explicit grants must not reopen a denied ancestor");
  assert.deepEqual(denied.allowWrite, []);
  console.log("PASS Windows ACL translation: missing targets, worktree markers and deny precedence");

  const childFile = join(temp, "lease-child.mjs");
  writeFileSync(
    childFile,
    `import {acquirePolicyLease} from ${JSON.stringify(pathToFileURL(bundle).href)};\ntry { const release=acquirePolicyLease(process.argv[2],process.argv[3],()=>{}); process.stdout.write('ready\\n'); process.stdin.resume(); process.stdin.once('end',()=>{release();process.exit(0)}); } catch(e) { process.stdout.write('blocked: '+e.message+'\\n'); process.exit(2); }`,
  );
  const database = join(temp, "leases.sqlite");
  const start = async (fingerprint) => {
    const child = spawn(process.execPath, [childFile, database, fingerprint], { stdio: ["pipe", "pipe", "pipe"] });
    children.push(child);
    const exit = once(child, "close");
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.resume();
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.stdout.once("data", resolve);
      child.once("close", () => output || reject(new Error("lease helper exited without result")));
    });
    return { child, output, exit };
  };
  let release = api.acquirePolicyLease(database, "A", () => {});
  const same = await start("A");
  assert.match(same.output, /^ready/);
  const different = await start("B");
  assert.match(different.output, /blocked:.*不同的文件或网络范围/);
  await different.exit;
  release();
  assert.throws(() => api.acquirePolicyLease(database, "B", () => {}), /不同的文件或网络范围/);
  same.child.stdin.end();
  await same.exit;
  release = api.acquirePolicyLease(database, "B", () => {});
  release();
  const crashed = await start("A");
  assert.match(crashed.output, /^ready/);
  crashed.child.kill("SIGKILL");
  await crashed.exit;
  assert.throws(
    () =>
      api.acquirePolicyLease(database, "B", () => {
        throw new Error("ACL recovery failed");
      }),
    /ACL recovery failed/,
  );
  let recovered;
  api.acquirePolicyLease(database, "B", (pid) => {
    recovered = pid;
  })();
  assert.equal(recovered, crashed.child.pid, "failed recovery retains its record until a successful retry");
  const raced = await Promise.all([start("C"), start("D")]);
  assert.equal(raced.filter((r) => r.output.startsWith("ready")).length, 1);
  assert.equal(raced.filter((r) => r.output.startsWith("blocked")).length, 1);
  for (const result of raced) result.child.stdin.end();
  await Promise.all(raced.map((r) => r.exit));
  console.log("PASS cross-process policy leases: matching scopes, conflicts, races, release and crash recovery");

  for (const [arch, machine] of [
    ["x64", 0x8664],
    ["arm64", 0xaa64],
  ]) {
    const path = resolve(`agent-runtime/dist/vendor/srt-win/${arch}/srt-win.exe`);
    assert.ok(existsSync(path), `missing ${arch} sandbox helper`);
    const binary = readFileSync(path);
    assert.equal(binary.toString("ascii", 0, 2), "MZ");
    const pe = binary.readUInt32LE(0x3c);
    assert.equal(binary.readUInt16LE(pe + 4), machine);
  }
  for (const { output } of Object.values(entries)) assert.ok(existsSync(resolve("agent-runtime/dist", output)));
  console.log("PASS packaged Windows x64/ARM64 helpers and setup entry point");
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  rmSync(temp, { recursive: true, force: true });
}
