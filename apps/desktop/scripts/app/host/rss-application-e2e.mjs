import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const servicePath = resolve(root, "../../packages/app/host/dist/service.mjs");
const applicationRoot = process.env.ISLE_RSS_APPLICATION_ROOT
  ? resolve(root, process.env.ISLE_RSS_APPLICATION_ROOT)
  : resolve(root, "../applications/builtins/rss-reader");
const applicationKind = process.env.ISLE_RSS_APPLICATION_KIND === "dsh" ? "dsh" : "isle";
const tempDir = mkdtempSync(join(tmpdir(), "isle-rss-application-"));
const settingsRoot = join(tempDir, "apps");
const feedServer = createServer((request, response) => {
  if (request.url !== "/feed.xml") {
    response.writeHead(404).end("not found");
    return;
  }
  const address = feedServer.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
  response.end(`<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Isle RSS Fixture</title>
        <link>${origin}</link>
        <description>Portable RSS application test feed</description>
        <item>
          <title>First portable entry</title>
          <link>${origin}/articles/first</link>
          <guid>isle-rss-first</guid>
          <pubDate>Tue, 25 Aug 2026 08:00:00 GMT</pubDate>
          <author>Isle Test</author>
          <description><![CDATA[<p>Readable <strong>summary</strong>.</p>]]></description>
        </item>
      </channel>
    </rss>`);
});
await new Promise((resolveListen, rejectListen) => {
  feedServer.once("error", rejectListen);
  feedServer.listen(0, "127.0.0.1", resolveListen);
});
const feedAddress = feedServer.address();
assert.ok(feedAddress && typeof feedAddress === "object");
const feedUrl = `http://127.0.0.1:${feedAddress.port}/feed.xml`;

const child = spawn(process.execPath, [servicePath], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
});
const output = createInterface({ input: child.stdout });
let stderr = "";
let nextId = 1;
const pending = new Map();

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
output.on("line", (line) => {
  let response;
  try {
    response = JSON.parse(line);
  } catch {
    return;
  }
  const operation = pending.get(response.id);
  if (!operation) return;
  pending.delete(response.id);
  clearTimeout(operation.timer);
  if (response.error) operation.reject(new Error(response.error.message));
  else operation.resolve(response.result);
});

const request = (method, params = null) =>
  new Promise((resolveRequest, rejectRequest) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectRequest(new Error(`RSS Application Host ${method} 请求超时。\n${stderr}`));
    }, 10_000);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });

const configure = () =>
  request("configure", {
    settingsPath: settingsRoot,
    applications: [
      {
        kind: applicationKind,
        id: "@isle/rss-reader",
        name: "RSS 阅读器",
        version: "0.1.0",
        description: "RSS application E2E fixture",
        source: "bundled",
        entry: pathToFileURL(resolve(applicationRoot, "index.js")).href,
        packageRoot: applicationRoot,
        ...(applicationKind === "dsh" ? { patchPath: resolve(applicationRoot, "cordis.patch.yml") } : {}),
      },
    ],
  });

try {
  const configured = await configure();
  const application = configured.applications[0];
  assert.equal(application.error, null);
  assert.equal(application.uiError, null);
  assert.deepEqual(application.ui, { kind: "sandbox", title: "RSS 阅读器", layout: "full" });
  const uiDocument = await request("uiDocument", { applicationId: "@isle/rss-reader" });
  assert.match(uiDocument.script, /isleApplication\.executeTool\("rss_list"/);
  assert.match(uiDocument.script, /isleApplication\.openExternal/);
  assert.match(uiDocument.style, /\.rss-app/);
  const toolNames = new Set(application.tools.map((tool) => tool.name));
  for (const toolName of ["rss_list", "rss_add", "rss_remove", "rss_fetch"]) {
    assert.equal(toolNames.has(toolName), true, `RSS 应用缺少 ${toolName}`);
  }

  const empty = await request("execute", {
    applicationId: "@isle/rss-reader",
    toolName: "rss_list",
    arguments: {},
  });
  assert.deepEqual(empty.value, { count: 0, feeds: [] });

  const added = await request("execute", {
    applicationId: "@isle/rss-reader",
    toolName: "rss_add",
    arguments: { url: feedUrl, name: "Local fixture", category: "Tests" },
  });
  assert.equal(added.value.added.url, feedUrl);
  assert.equal(added.value.feedTitle, "Isle RSS Fixture");
  const rssSettingsPath = join(settingsRoot, "@isle", "rss-reader", "settings.yaml");
  assert.equal(existsSync(rssSettingsPath), true, "RSS 设置必须保存到独立 namespace 目录。");
  assert.match(readFileSync(rssSettingsPath, "utf8"), /http:\/\/127\.0\.0\.1:/);
  assert.equal(statSync(rssSettingsPath).mode & 0o777, 0o600);
  assert.equal(statSync(join(settingsRoot, "@isle", "rss-reader")).mode & 0o777, 0o700);
  assert.equal(existsSync(join(settingsRoot, "settings.yaml")), false, "新安装不应创建共享 settings 文件。");

  const fetched = await request("execute", {
    applicationId: "@isle/rss-reader",
    toolName: "rss_fetch",
    arguments: { url: feedUrl, limit: 10 },
  });
  assert.equal(fetched.value.feed.title, "Isle RSS Fixture");
  assert.equal(fetched.value.entries.length, 1);
  assert.equal(fetched.value.entries[0].title, "First portable entry");
  assert.match(fetched.value.entries[0].summary, /^Readable summary\s*\.$/);

  await configure();
  const persisted = await request("execute", {
    applicationId: "@isle/rss-reader",
    toolName: "rss_list",
    arguments: {},
  });
  assert.equal(persisted.value.count, 1, "RSS 订阅必须跨 Host 重载持久化。");
  assert.equal(persisted.value.feeds[0].url, feedUrl);

  await request("execute", {
    applicationId: "@isle/rss-reader",
    toolName: "rss_remove",
    arguments: { url: feedUrl },
  });
  const removed = await request("execute", {
    applicationId: "@isle/rss-reader",
    toolName: "rss_list",
    arguments: {},
  });
  assert.deepEqual(removed.value, { count: 0, feeds: [] });

  await request("shutdown");
  child.stdin.end();
  const exitCode = await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((_, rejectExit) => setTimeout(() => rejectExit(new Error("RSS Application Host 关闭超时。")), 5_000)),
  ]);
  assert.equal(exitCode, 0, stderr);
  console.log("RSS application E2E passed.");
} finally {
  output.close();
  if (child.exitCode === null) child.kill();
  await new Promise((resolveClose) => feedServer.close(resolveClose));
  rmSync(tempDir, { recursive: true, force: true });
}
