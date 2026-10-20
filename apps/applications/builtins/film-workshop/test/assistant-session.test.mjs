import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "film-session-test-"));
after(() => rm(temporary, { recursive: true, force: true }));
const bundle = join(temporary, "sessions.mjs");
await build({
  stdin: {
    contents: `export * from "./main/assistant-session";
export { PRODUCT_KEYS } from "@mewvis/product-config";
export { getApplicationChatClient } from "@mewvis/app-sdk/chat";
export { createApplicationChatHost } from "../../../client/src/chat/desktop/application";`,
    resolveDir: app,
  },
  bundle: true,
  outfile: bundle,
  format: "esm",
  platform: "node",
  target: "node22",
});
let fixtures = 0;

async function fixture(t) {
  const api = await import(
    pathToFileURL(bundle).href + `?fixture=${++fixtures}`
  );
  const records = new Map(),
    sessions = new Map(),
    values = new Map();
  let failOpen = false,
    sent = 0;
  const host = api.createApplicationChatHost(
    {
      async loadRecordSource(_path, id) {
        if (failOpen) throw new Error("测试助手连接失败");
        return records.get(id);
      },
      async openSession(input) {
        if (!sessions.has(input.identity.id)) {
          let snapshot = {
            identity: input.identity,
            phase: "idle",
            config: {},
            resources: { models: [{ value: "my-media-model" }] },
          };
          sessions.set(input.identity.id, {
            identity: input.identity,
            getSnapshot: () => snapshot,
            flush: async () => ({ ok: true }),
            updateConfig: async (patch) => {
              snapshot = {
                ...snapshot,
                config: { ...snapshot.config, ...patch },
              };
              return { ok: true };
            },
            send: async () => ({
              status: "dispatched",
              taskId: `task-${++sent}`,
            }),
          });
          records.set(input.identity.id, {
            workspaceId: input.workspaceId,
            origin: input.origin,
            profile: input.profileData,
          });
        }
        return sessions.get(input.identity.id);
      },
      getLocation: () => ({ workspacePath: "/film-test" }),
    },
    {
      authorize: async () => ({
        workspacePath: "/film-test",
        knowledge: false,
      }),
    },
  );
  const connection = host.connect("film-workshop", [], () => {});
  const globalKey = api.PRODUCT_KEYS.applicationGlobal;
  const previous = globalThis[globalKey];
  globalThis[globalKey] = {
    version: 1,
    chat: {
      request: (request) => connection.request(request),
      subscribe: () => () => {},
    },
    data: {
      version: 1,
      async request({ method, params }) {
        if (method === "storage.getItem")
          return { ok: true, value: values.get(params.key) ?? null };
        if (method === "storage.setItem") {
          values.set(params.key, structuredClone(params.value));
          return { ok: true, value: null };
        }
        throw new Error(`Unexpected data operation: ${method}`);
      },
    },
  };
  t.after(() => {
    api.getApplicationChatClient().dispose();
    connection.dispose();
    if (previous === undefined) delete globalThis[globalKey];
    else globalThis[globalKey] = previous;
  });
  const project = { id: "project", workspace: { id: "workspace" } };
  const key = api.assistantKey(project, "episode");
  return {
    api,
    key,
    project,
    records,
    values,
    fail: (value) => {
      failOpen = value;
    },
  };
}

test("saved profile metadata stays local when restoring through the real chat host", async (t) => {
  const f = await fixture(t);
  const created = await f.api.createSession(f.key, "workspace");
  const index = structuredClone(f.values.get(f.key));
  assert.equal(index.profileVersion, 5);
  assert.ok(
    f.records
      .get(created.identity.id)
      .profile.allowedToolNames.includes("ask_user"),
  );
  assert.ok(
    f.records
      .get(created.identity.id)
      .profile.allowedToolNames.includes("film_prepare_media"),
  );
  await assert.rejects(
    f.api.getApplicationChatClient().openSession(index),
    /包含不支持的聊天参数/,
  );
  const restored = await f.api.connect(f.key, "workspace");
  assert.equal(restored.identity.id, created.identity.id);
  assert.equal(f.records.size, 1);
  assert.deepEqual(f.values.get(f.key), index);
  assert.equal(
    (await restored.send({ text: "继续完善当前分镜" })).status,
    "dispatched",
  );
});

test("a failed restore can retry the same saved conversation without creating another chat", async (t) => {
  const f = await fixture(t);
  const created = await f.api.createSession(f.key, "workspace");
  f.fail(true);
  await assert.rejects(
    f.api.projectSession(f.project, "episode"),
    /测试助手连接失败/,
  );
  assert.equal(f.api.connections.has(f.key), false);
  f.fail(false);
  const restored = await f.api.projectSession(f.project, "episode");
  assert.equal(restored.identity.id, created.identity.id);
  assert.equal(f.records.size, 1);
});

test("restoring a conversation still rejects a different workspace", async (t) => {
  const f = await fixture(t);
  await f.api.createSession(f.key, "workspace");
  await assert.rejects(
    f.api.connect(f.key, "another-workspace"),
    /工作区不一致/,
  );
  assert.equal(f.records.size, 1);
});

test("unsupported profile versions are rejected without upgrading or replacing the conversation", async (t) => {
  const f = await fixture(t);
  const old = await f.api.createSession(f.key, "workspace");
  assert.equal(
    (
      await old.updateConfig({
        selectedModelId: "my-media-model",
        thinkingLevel: "high",
        permissionMode: "ask",
      })
    ).ok,
    true,
  );
  for (const profileVersion of [undefined, 4, 6]) {
    const index = {
      workspaceId: "workspace",
      chatId: old.identity.id,
      ...(profileVersion === undefined ? {} : { profileVersion }),
    };
    f.values.set(f.key, index);
    f.values.set(f.api.assistantProfileKey(old.identity.id), profileVersion);
    await assert.rejects(
      f.api.connect(f.key, "workspace"),
      /不支持的助手配置版本/,
    );
    await assert.rejects(
      f.api.sessionProfileVersion(old.identity.id),
      /不支持的助手配置版本/,
    );
    assert.deepEqual(f.values.get(f.key), index);
    assert.equal(f.records.size, 1);
    assert.equal(old.getSnapshot().config.selectedModelId, "my-media-model");
  }
  const created = await f.api.createSession(f.key, "workspace");
  assert.notEqual(created.identity.id, old.identity.id);
  assert.equal(f.records.size, 2);
  assert.equal(f.values.get(f.key).profileVersion, 5);
});

test("assistant sessions require the project workspace even with a saved reference", async (t) => {
  const f = await fixture(t);
  assert.throws(
    () => f.api.assistantKey({ id: "project" }, "episode"),
    /项目工作目录/,
  );
  await assert.rejects(f.api.createSession(f.key, undefined), /项目工作目录/);
  assert.equal(f.records.size, 0);
  const created = await f.api.createSession(f.key, "workspace");
  const index = structuredClone(f.values.get(f.key));
  await assert.rejects(f.api.connect(f.key, undefined), /项目工作目录/);
  assert.deepEqual(f.values.get(f.key), index);
  assert.equal(f.records.size, 1);
  assert.equal(
    (await f.api.connect(f.key, "workspace")).identity.id,
    created.identity.id,
  );
});

test("project sessions only use the workspace-bound assistant index", async (t) => {
  const f = await fixture(t);
  const oldKey = "film:assistant:project:episode";
  const oldIndex = { workspaceId: "default", chatId: "old-chat" };
  f.values.set(oldKey, oldIndex);
  assert.equal(f.key, "film:assistant:v2:project:episode:workspace");
  const created = await f.api.projectSession(f.project, "episode");
  assert.notEqual(created.identity.id, oldIndex.chatId);
  assert.deepEqual(f.values.get(oldKey), oldIndex);
  assert.equal(f.values.get(f.key).workspaceId, "workspace");
});
