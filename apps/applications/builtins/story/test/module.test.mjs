import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import application from "../dist/mewvis/index.js";

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "story-module-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = {
    id: randomUUID(),
    name: "原版故事",
    path: root,
    isDefault: false,
  };
  const entries = new Map(),
    values = new Map(),
    tools = new Map();
  entries.set(workspace.id, workspace);
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    removeItem: async (key) => {
      values.delete(key);
    },
    keys: async () => [...values.keys()],
  };
  application.apply({
    tools: { register: (tool) => tools.set(tool.name, tool) },
    skills: { register() {} },
    storage,
    workspaces: {
      list: async () => [...entries.values()],
      get: async (id) => {
        if (!entries.has(id)) throw new Error("未登记");
        return entries.get(id);
      },
      remove: async ({ id, deleteContent }) => {
        if (deleteContent) await rm(root, { recursive: true });
        entries.delete(id);
      },
    },
  });
  const call = (tool, input) => tools.get(tool).execute(input);
  const project = (action, input) =>
    call("mewvis_story_project", { action, workspaceId: workspace.id, input });
  await project("create", {
    storyId: "original-story-id",
    title: workspace.name,
    storyTypeId: "long-novel",
  });
  return { workspace, root, values, call, project };
}
test("original project facade exposes documents, schema, rename and remove without changing file format", async (t) => {
  const s = await setup(t);
  assert.equal((await s.project("overview")).id, "original-story-id");
  const docs = await s.project("listDocuments");
  const book = docs.find((doc) => doc.ref.kind === "story-book");
  assert.ok(book);
  await s.project("saveDocument", {
    ref: book.ref,
    value: { ...book.value, title: "修改后的故事" },
  });
  assert.equal((await s.project("overview")).title, "修改后的故事");
  assert.ok(
    (await s.project("describe", { documentKinds: ["story-book"] })).schemas
      .documents["story-book"],
  );
  await assert.rejects(
    s.call("mewvis_story_project", {
      action: "overview",
      workspaceId: "another-app",
    }),
    /未登记/,
  );
});
test("removing a library record keeps its files and does not resurrect it", async (t) => {
  const s = await setup(t);
  await s.call("mewvis_story_library", {
    action: "add",
    workspaceId: s.workspace.id,
  });
  assert.equal(
    (await s.call("mewvis_story_library", { action: "list" })).length,
    1,
  );
  await s.call("mewvis_story_library", { action: "remove", id: s.workspace.id });
  assert.ok(await readFile(join(s.root, "story/book.json"), "utf8"));
  assert.deepEqual(await s.call("mewvis_story_library", { action: "list" }), []);
});
test("tavern config and original message paths round-trip; traversal and unrelated files are rejected", async (t) => {
  const s = await setup(t);
  for (const path of [
    "story/tavern.json",
    ".tavern/original-story-id/chapter-01/messages.json",
  ]) {
    const input = { workspaceId: s.workspace.id, path };
    await s.call("mewvis_story_file", {
      ...input,
      action: "write",
      content: '[{"text":"原酒馆消息"}]',
    });
    assert.match(
      (await s.call("mewvis_story_file", { ...input, action: "read" })).content,
      /原酒馆消息/,
    );
    await s.call("mewvis_story_file", { ...input, action: "delete" });
    assert.equal(
      await s.call("mewvis_story_file", { ...input, action: "read" }),
      null,
    );
  }
  for (const path of [
    ".tavern/original-story-id/chapter-01/.__tavern_workspace_init-old.tmp",
    "../secret",
    ".tavern/../chapter/messages.json",
    "story/book.json",
    ".mewvis/workspace.json",
  ])
    await assert.rejects(
      s.call("mewvis_story_file", {
        workspaceId: s.workspace.id,
        path,
        action: "write",
        content: "bad",
      }),
    );
});
test("listing the library does not adopt workspaces or rewrite legacy chat files", async (t) => {
  const s = await setup(t);
  assert.deepEqual(await s.call("mewvis_story_library", { action: "list" }), []);
  const directory = join(s.root, ".legacy/chats/old-chat");
  await mkdir(directory, { recursive: true });
  const original = JSON.stringify({
    id: "old-chat",
    origin: { kind: "builtin", sceneId: "story-assistant" },
  });
  await writeFile(join(directory, "meta.json"), original);
  // Persisted IDs from completed migrations remain valid after retiring the migrator.
  s.values.set("story.library/old-story", {
    id: "old-story",
    name: "旧故事",
    workspacePath: s.root,
    applicationWorkspaceId: s.workspace.id,
    legacyChatDirectory: ".legacy",
    createdAt: 1,
    updatedAt: 1,
  });
  const records = await s.call("mewvis_story_library", { action: "list" });
  assert.equal(records[0].id, "old-story");
  assert.equal(await readFile(join(directory, "meta.json"), "utf8"), original);
  const imported = await s.call("mewvis_story_library", {
    action: "add",
    workspaceId: s.workspace.id,
    name: "再次导入",
  });
  assert.equal(imported.id, "old-story");
  assert.equal(
    (await s.call("mewvis_story_library", { action: "list" })).length,
    1,
  );
  await s.call("mewvis_story_library", { action: "remove", id: "old-story" });
  assert.deepEqual(await s.call("mewvis_story_library", { action: "list" }), []);
  assert.equal(await readFile(join(directory, "meta.json"), "utf8"), original);
});
