import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import application from "../dist/isle/index.js";

const registered = new Map();
const enrolled = new Map();
application.apply({
  tools: { register(tool) { registered.set(tool.name, tool); } },
  skills: { register() {} },
  workspaces: {
    async get(id) {
      const workspace = enrolled.get(id);
      if (!workspace) throw new Error("应用工作区未登记");
      return workspace;
    },
  },
});
const run = (name, args) => registered.get(name).execute(args);
const fixture = async (applications = ["@isle/story"], enroll = true) => {
  const workspacePath = await mkdtemp(join(tmpdir(), "isle-story-app-"));
  const workspaceId = randomUUID();
  await mkdir(join(workspacePath, ".isle"));
  await writeFile(join(workspacePath, ".isle", "workspace.json"),
    JSON.stringify({ version: 1, id: workspaceId, applications }));
  if (enroll && applications.includes("@isle/story"))
    enrolled.set(workspaceId, { id: workspaceId, path: workspacePath });
  return {
    workspaceId, workspacePath,
    dispose: () => { enrolled.delete(workspaceId); return rm(workspacePath, { recursive: true, force: true }); },
  };
};

test("the app creates, reads and edits the existing story project format", async t => {
  const workspace = await fixture();
  t.after(workspace.dispose);
  const args = { workspaceId: workspace.workspaceId };
  assert.equal((await run("isle_story_inspect", args)).status, "empty");
  const created = await run("isle_story_create", { ...args, title: "测试故事", storyTypeId: "long-novel" });
  assert.equal(created.status, "ready");
  assert.equal(created.overview.title, "测试故事");
  assert.ok(created.documents.length > 0);
  assert.equal("value" in created.documents[0], false, "the library only transfers document summaries");

  const summary = created.documents.find(document => document.ref.kind === "story-book");
  const { document } = await run("isle_story_get_document", { ...args, ref: summary.ref });
  const saved = await run("isle_story_save_document", {
    ...args, ref: document.ref, value: { ...document.value, goal: "写完第一卷" },
  });
  assert.equal(saved.overview.goal, "写完第一卷");
  assert.equal((await run("isle_story_inspect", args)).overview.goal, "写完第一卷");
  const context = (await run("isle_story_read_context", { ...args, scope: "project" })).context;
  assert.match(context.text, /测试故事/);
  const changeSet = {
    storyTypeId: created.structure.storyType.id,
    storyTypeVersion: created.structure.storyType.version,
    storyId: created.overview.id,
    baseRevision: context.revision,
    validationMode: "draft",
    operations: [{ type: "patch", ref: summary.ref, value: { premise: "主角寻找失落的城" } }],
  };
  assert.equal((await run("isle_story_validate_changes", { ...args, changeSet })).validation.valid, true);
  const committed = await run("isle_story_commit_changes", { ...args, changeSet });
  assert.equal(committed.result.committed, true);
  assert.equal((await run("isle_story_get_document", { ...args, ref: summary.ref })).document.value.premise,
    "主角寻找失落的城");
  const config = { id: "tavern-test", title: "测试故事 · 酒馆", presentation: { profileId: "dialogue-chat" } };
  assert.equal((await run("isle_story_tavern_read", args)).config, null);
  await run("isle_story_tavern_save", { ...args, config });
  assert.deepEqual((await run("isle_story_tavern_read", args)).config, config);
  assert.deepEqual(JSON.parse(await readFile(join(workspace.workspacePath, "story", "tavern.json"), "utf8")), config);
});

test("tools resolve only this application's registered workspace", async t => {
  const other = await fixture(["@isle/other"]);
  t.after(other.dispose);
  await assert.rejects(
    run("isle_story_inspect", { workspaceId: other.workspaceId }),
    /未登记/,
  );
  const workspace = await fixture();
  t.after(workspace.dispose);
  await assert.rejects(
    run("isle_story_inspect", { workspaceId: randomUUID() }),
    /未登记/,
  );
  const forged = await fixture(["@isle/story"], false);
  t.after(forged.dispose);
  await assert.rejects(
    run("isle_story_inspect", { workspaceId: forged.workspaceId }),
    /未登记/,
  );
  await run("isle_story_create", {
    workspaceId: workspace.workspaceId, workspacePath: forged.workspacePath,
    title: "只写入已登记目录", storyTypeId: "long-novel",
  });
  assert.equal((await run("isle_story_inspect", { workspaceId: workspace.workspaceId })).status, "ready");
  await assert.rejects(readFile(join(forged.workspacePath, "story", ".isle-claw", "project.json")),
    { code: "ENOENT" });
});

test("agent tools use the authenticated working directory when workspace data is unavailable", async t => {
  const workspace = await fixture();
  t.after(workspace.dispose);
  const agentTools = new Map();
  application.apply({
    tools: { register(tool) { agentTools.set(tool.name, tool); } },
    skills: { register() {} },
    workspaces: {
      async get() { throw Object.assign(new Error("无持久化数据连接"), { code: "CAPABILITY_UNAVAILABLE" }); },
    },
  });
  const previous = process.cwd();
  process.chdir(workspace.workspacePath);
  try {
    assert.equal((await agentTools.get("isle_story_inspect").execute({ workspaceId: workspace.workspaceId })).status,
      "empty");
    await assert.rejects(agentTools.get("isle_story_inspect").execute({ workspaceId: randomUUID() }),
      /未登记/);
  } finally {
    process.chdir(previous);
  }
});

test("the short story type opens through the same app tools", async t => {
  const workspace = await fixture();
  t.after(workspace.dispose);
  const args = { workspaceId: workspace.workspaceId };
  const created = await run("isle_story_create", { ...args, title: "测试短篇", storyTypeId: "short-novel" });
  assert.equal(created.structure.storyType.id, "short-novel");
  assert.equal((await run("isle_story_inspect", args)).overview.title, "测试短篇");
});
