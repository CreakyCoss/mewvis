import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import { packApplication } from "@mewvis/app-dev/tooling";
import { repositoryRoot } from "../../../applications/scripts/docs/book.mjs";

const desktop = join(repositoryRoot, "apps/client");
const temporary = await mkdtemp(join(tmpdir(), "mewvis-docs-reader-"));
let child;
let output;
const pending = new Map();
try {
  const source = join(desktop, "../applications/builtins/docs-reader");
  const { outputRoot, manifest } = await packApplication({
    source,
    outDir: join(temporary, "application"),
    quiet: true,
  });
  assert.equal(manifest.mewvis.defaultEnabled, true);
  assert.deepEqual(manifest.mewvis.permissions, ["open-external"]);
  const bundledSource = await readFile(join(outputRoot, "index.js"), "utf8");
  assert.doesNotMatch(bundledSource, /from ["'][^"']*book\.json/);
  child = spawn(
    process.execPath,
    [
      join(
        desktop,
        process.argv.includes("--bundled")
          ? "../agent-runtime/dist/app-host/service.mjs"
          : "../../packages/app/host/dist/service.mjs",
      ),
    ],
    {
      cwd: temporary,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const exited = new Promise((resolve) => child.once("exit", resolve));
  let stderr = "";
  let nextId = 0;
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const fail = (error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  };
  child.on("error", fail);
  child.on("exit", () => fail(new Error(`应用宿主退出：${stderr}`)));
  output = createInterface({ input: child.stdout });
  output.on("line", (line) => {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    const item = pending.get(response.id);
    if (!item) return;
    pending.delete(response.id);
    clearTimeout(item.timer);
    if (response.error) item.reject(new Error(response.error.message));
    else item.resolve(response.result);
  });
  const rpc = (method, params = null) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} 超时：${stderr}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  const configured = await rpc("configure", {
    settingsPath: join(temporary, "settings"),
    applications: [
      {
        kind: "mewvis",
        id: manifest.name,
        name: "文档中心",
        version: manifest.version,
        description: manifest.description,
        source: "bundled",
        permissions: manifest.mewvis.permissions,
        entry: pathToFileURL(join(outputRoot, "index.js")).href,
        packageRoot: outputRoot,
      },
    ],
  });
  assert.equal(configured.applications[0].error, null);
  assert.equal(configured.applications[0].uiError, null);
  assert.equal(Object.hasOwn(configured.applications[0].ui, "layout"), false);
  assert.equal(configured.applications[0].tools.length, 3);
  const tool = async (toolName, args = {}) =>
    (await rpc("execute", { applicationId: manifest.name, toolName, arguments: args })).value;
  const catalog = await tool("mewvis_docs_catalog");
  assert.ok(catalog.entries.length >= 30);
  const document = await tool("mewvis_docs_read", { id: "README.md" });
  assert.match(document.html, /Mewvis 中文文档/);
  assert.ok((await tool("mewvis_docs_search", { query: "沙箱" })).total > 0);
  assert.equal((await tool("mewvis_docs_search", { query: "zzzz不存在zzzz" })).total, 0);
  await assert.rejects(tool("mewvis_docs_read", { id: "../../package.json" }), /不存在/);
  await assert.rejects(tool("mewvis_docs_search", { query: "a".repeat(201) }));
  assert.deepEqual(
    await tool("mewvis_docs_read", { id: "README.md", path: "/etc/passwd" }),
    document,
    "额外路径不能改变读取目标",
  );
  const ui = await rpc("uiDocument", { applicationId: manifest.name });
  new Script(ui.script, { filename: manifest.mewvis.ui.entry });
  assert.match(ui.script, /_docs_search/);
  assert.match(ui.style, /\.docs-app/);
  assert.ok(Buffer.byteLength(ui.script) <= 512 * 1024);
  await rpc("shutdown");
  child.stdin.end();
  let timer;
  try {
    assert.equal(
      await Promise.race([
        exited,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("宿主关闭超时")), 5000);
        }),
      ]),
      0,
      stderr,
    );
  } finally {
    clearTimeout(timer);
  }
  console.log("文档阅读器真实宿主、离线打包与工具契约验证通过。");
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  output?.close();
  if (child && child.exitCode === null) child.kill();
  await rm(temporary, { recursive: true, force: true });
}
