import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const servicePath = resolve(root, "agent-runtime/dist/app-host/service.mjs");
const applicationRoot = process.env.ISLE_STORY_SCENE_CARD_APPLICATION_ROOT
  ? resolve(root, process.env.ISLE_STORY_SCENE_CARD_APPLICATION_ROOT)
  : resolve(root, "applications/builtins/story-scene-card");
const applicationKind = process.env.ISLE_STORY_SCENE_CARD_APPLICATION_KIND === "dsh" ? "dsh" : "isle";
const tempDir = mkdtempSync(join(tmpdir(), "isle-story-scene-card-"));
const child = spawn(process.execPath, [servicePath], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
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
      rejectRequest(new Error(`Story Scene Card Host ${method} 请求超时。\n${stderr}`));
    }, 10_000);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });

try {
  const configured = await request("configure", {
    settingsPath: join(tempDir, "apps"),
    applications: [
      {
        kind: applicationKind,
        id: "@isle/story-scene-card",
        name: "小说场景卡",
        version: "0.1.0",
        description: "Story scene card E2E fixture",
        source: "bundled",
        entry: pathToFileURL(resolve(applicationRoot, "index.js")).href,
        packageRoot: applicationRoot,
        ...(applicationKind === "dsh" ? { patchPath: resolve(applicationRoot, "cordis.patch.yml") } : {}),
      },
    ],
  });
  const application = configured.applications[0];
  assert.equal(application.error, null);
  assert.equal(application.uiError, null);
  assert.deepEqual(
    application.tools.map((tool) => tool.name),
    ["isle_story_scene_card"],
  );

  const document = await request("uiDocument", { applicationId: "@isle/story-scene-card" });
  assert.match(document.script, /isle_story_scene_card/);
  assert.match(document.style, /\.scene-workbench/);

  const result = await request("execute", {
    applicationId: "@isle/story-scene-card",
    toolName: "isle_story_scene_card",
    arguments: {
      goal: "拿到账本",
      conflict: "守卫封锁仓库",
      stakes: "同伴会被当作内鬼处置",
      turn: "账本已经被调包",
    },
  });
  assert.equal(result.value.goal, "拿到账本");
  assert.match(result.value.draftingPrompt, /账本已经被调包/);
  await assert.rejects(
    request("execute", {
      applicationId: "@isle/story-scene-card",
      toolName: "isle_story_scene_card",
      arguments: { goal: "拿到账本", conflict: "守卫封锁仓库" },
    }),
    /stakes/,
  );

  await request("shutdown");
  child.stdin.end();
  const exitCode = await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((_, rejectExit) => setTimeout(() => rejectExit(new Error("Story Scene Card Host 关闭超时。")), 5_000)),
  ]);
  assert.equal(exitCode, 0, stderr);
  console.log(`Story scene card E2E passed (${applicationKind}).`);
} finally {
  output.close();
  if (child.exitCode === null) child.kill();
  rmSync(tempDir, { recursive: true, force: true });
}
