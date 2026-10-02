import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import application from "../dist/mewvis/index.js";

const registered = new Map();
const registeredSkills = new Map();
const enrolled = new Map();
application.apply({
  tools: { register(tool) { registered.set(tool.name, tool); } },
  skills: { register(skill) { registeredSkills.set(skill.name, skill); } },
  workspaces: {
    async get(id) {
      const workspace = enrolled.get(id);
      if (!workspace) throw new Error("应用工作区未登记");
      return workspace;
    },
  },
});
const run = (name, args) => registered.get(name).execute(args);
const fixture = async (applications = ["@mewvis/story"], enroll = true) => {
  const workspacePath = await mkdtemp(join(tmpdir(), "mewvis-story-app-"));
  const workspaceId = randomUUID();
  await mkdir(join(workspacePath, ".mewvis"));
  await writeFile(join(workspacePath, ".mewvis", "workspace.json"),
    JSON.stringify({ version: 1, id: workspaceId, applications }));
  if (enroll && applications.includes("@mewvis/story"))
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
  assert.equal((await run("mewvis_story_inspect", args)).status, "empty");
  const created = await run("mewvis_story_create", { ...args, title: "测试故事", storyTypeId: "long-novel" });
  assert.equal(created.status, "ready");
  assert.equal(created.overview.title, "测试故事");
  assert.ok(created.documents.length > 0);
  assert.equal("value" in created.documents[0], false, "the library only transfers document summaries");

  const summary = created.documents.find(document => document.ref.kind === "story-book");
  const { document } = await run("mewvis_story_get_document", { ...args, ref: summary.ref });
  const saved = await run("mewvis_story_save_document", {
    ...args, ref: document.ref, value: { ...document.value, goal: "写完第一卷" },
  });
  assert.equal(saved.overview.goal, "写完第一卷");
  assert.equal((await run("mewvis_story_inspect", args)).overview.goal, "写完第一卷");
  const context = (await run("mewvis_story_read_context", { ...args, scope: "project" })).context;
  assert.match(context.text, /测试故事/);
  const changeSet = {
    storyTypeId: created.structure.storyType.id,
    storyTypeVersion: created.structure.storyType.version,
    storyId: created.overview.id,
    baseRevision: context.revision,
    validationMode: "draft",
    operations: [{ type: "patch", ref: summary.ref, value: { premise: "主角寻找失落的城" } }],
  };
  assert.equal((await run("mewvis_story_validate_changes", { ...args, changeSet })).validation.valid, true);
  const committed = await run("mewvis_story_commit_changes", { ...args, changeSet });
  assert.equal(committed.result.committed, true);
  assert.equal((await run("mewvis_story_get_document", { ...args, ref: summary.ref })).document.value.premise,
    "主角寻找失落的城");
  const config = { id: "tavern-test", title: "测试故事 · 酒馆", presentation: { profileId: "dialogue-chat" } };
  assert.equal((await run("mewvis_story_tavern_read", args)).config, null);
  await run("mewvis_story_tavern_save", { ...args, config });
  assert.deepEqual((await run("mewvis_story_tavern_read", args)).config, config);
  assert.deepEqual(JSON.parse(await readFile(join(workspace.workspacePath, "story", "tavern.json"), "utf8")), config);
  const messages = [{ id: "msg-1", roomId: "tavern-test", role: "user", kind: "user_text",
    body: { type: "text", text: "有人吗？" }, createdAt: Date.now(), status: "done" }];
  assert.deepEqual((await run("mewvis_story_tavern_room_read", { ...args, chapterId: "chapter-1" })).messages, []);
  await run("mewvis_story_tavern_room_save", { ...args, chapterId: "chapter-1", messages });
  assert.deepEqual((await run("mewvis_story_tavern_room_read", { ...args, chapterId: "chapter-1" })).messages, messages);
  assert.deepEqual(JSON.parse(await readFile(join(workspace.workspacePath, ".tavern", workspace.workspaceId,
    "chapter-1", "messages.json"), "utf8")), messages);
  await run("mewvis_story_tavern_room_reset", { ...args, chapterId: "chapter-1" });
  assert.deepEqual((await run("mewvis_story_tavern_room_read", { ...args, chapterId: "chapter-1" })).messages, []);
});

test("tools resolve only this application's registered workspace", async t => {
  const other = await fixture(["@mewvis/other"]);
  t.after(other.dispose);
  await assert.rejects(
    run("mewvis_story_inspect", { workspaceId: other.workspaceId }),
    /未登记/,
  );
  const workspace = await fixture();
  t.after(workspace.dispose);
  await assert.rejects(
    run("mewvis_story_inspect", { workspaceId: randomUUID() }),
    /未登记/,
  );
  const forged = await fixture(["@mewvis/story"], false);
  t.after(forged.dispose);
  await assert.rejects(
    run("mewvis_story_inspect", { workspaceId: forged.workspaceId }),
    /未登记/,
  );
  await run("mewvis_story_create", {
    workspaceId: workspace.workspaceId, workspacePath: forged.workspacePath,
    title: "只写入已登记目录", storyTypeId: "long-novel",
  });
  assert.equal((await run("mewvis_story_inspect", { workspaceId: workspace.workspaceId })).status, "ready");
  await assert.rejects(readFile(join(forged.workspacePath, "story", ".mewvis", "project.json")),
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
    assert.equal((await agentTools.get("mewvis_story_inspect").execute({ workspaceId: workspace.workspaceId })).status,
      "empty");
    await assert.rejects(agentTools.get("mewvis_story_inspect").execute({ workspaceId: randomUUID() }),
      /未登记/);
  } finally {
    process.chdir(previous);
  }
});

test("the short story type opens through the same app tools", async t => {
  const workspace = await fixture();
  t.after(workspace.dispose);
  const args = { workspaceId: workspace.workspaceId };
  const created = await run("mewvis_story_create", { ...args, title: "测试短篇", storyTypeId: "short-novel" });
  assert.equal(created.structure.storyType.id, "short-novel");
  assert.equal((await run("mewvis_story_inspect", args)).overview.title, "测试短篇");
});

test("the app bundles the original assistant workflows and Story Contract tool", async t => {
  assert.deepEqual([...registeredSkills.keys()].sort(), [
    "story-assistant",
    "story-assistant-deslop",
    "story-assistant-import",
    "story-assistant-long-analyze",
    "story-assistant-long-write",
    "story-assistant-review",
    "story-assistant-short-analyze",
    "story-assistant-short-write",
  ]);
  const listed = await run("mewvis_story_skill", {});
  assert.equal(listed.skills.length, 8);
  assert.match((await run("mewvis_story_skill", { name: "story-assistant" })).content, /Story Contract/);
  assert.match((await run("mewvis_story_skill_resource", {
    skillName: "story-assistant-deslop",
    path: "../story-assistant/references/story-tool-binding.md",
  })).content, /describe_structure/);

  const workspace = await fixture();
  t.after(workspace.dispose);
  const args = { workspaceId: workspace.workspaceId };
  await run("mewvis_story_create", { ...args, title: "协议故事", storyTypeId: "long-novel" });
  const described = await run("story", { ...args, action: "describe_structure" });
  assert.equal(described.available, true);
  assert.equal(described.structure.storyType.id, "long-novel");
  const context = await run("story", { ...args, action: "read_context", scope: "project" });
  assert.match(context.text, /协议故事/);
});
