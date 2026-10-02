import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [new URL("../main/api.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "chat-session-fixture",
      setup(builder) {
        builder.onResolve(
          { filter: /^@isle\/app-sdk\/(chat|data|browser)$/ },
          ({ path }) => ({ path, namespace: "fixture" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
          contents: path.endsWith("/chat")
            ? "export const getApplicationChatClient = () => globalThis.workshopChatFixture.client;"
            : path.endsWith("/data")
              ? "export const getApplicationDataClient = () => globalThis.workshopChatFixture.data;"
              : "export const getApplicationHost = () => { throw new Error('Project tools are outside this fixture'); };",
          loader: "js",
        }));
      },
    },
  ],
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;
const loadAPI = () => import(`${moduleURL}#${randomUUID()}`);

async function fixture(t) {
  const project = {
    id: randomUUID(),
    name: "计时器",
    revision: 2,
    files: ["src/App.tsx"],
  };
  const records = [];
  const sessions = new Map();
  const values = new Map();
  const calls = { opened: [], created: [], closed: [] };
  let failure = "";
  const makeSession = (chatId) => ({
    identity: { id: chatId },
    flush: async () => ({ ok: true }),
    close: async () => {
      calls.closed.push(chatId);
      return { ok: true };
    },
  });
  function seed(
    chatId,
    updatedAt,
    sceneId = "workshop-developer",
    workspaceId = project.id,
  ) {
    records.push({
      chatId,
      updatedAt,
      createdAt: updatedAt,
      title: chatId,
      messageCount: 1,
      sceneId,
      workspaceId,
    });
    const session = makeSession(chatId);
    sessions.set(chatId, session);
    return session;
  }
  globalThis.workshopChatFixture = {
    data: {
      storage: {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => {
          values.set(key, value);
        },
      },
    },
    client: {
      listSessions: async ({ workspaceId }) =>
        records.filter((record) => record.workspaceId === workspaceId),
      openSession: async ({ workspaceId, chatId }) => {
        if (failure) throw new Error(failure);
        assert.ok(
          records.some(
            (record) =>
              record.workspaceId === workspaceId && record.chatId === chatId,
          ),
        );
        calls.opened.push(chatId);
        return sessions.get(chatId);
      },
      createSession: async (input) => {
        if (failure) throw new Error(failure);
        calls.created.push(input);
        const session = makeSession(randomUUID());
        sessions.set(session.identity.id, session);
        return session;
      },
    },
  };
  t.after(() => {
    delete globalThis.workshopChatFixture;
  });
  return {
    api: await loadAPI(),
    project,
    seed,
    values,
    calls,
    fail: (error) => {
      failure = error;
    },
  };
}

test("opening an editor coalesces requests and restores only its latest authoring conversation", async (t) => {
  const { api, project, seed, calls } = await fixture(t);
  seed("old", 1);
  const latest = seed("latest", 2);
  seed("other-scene", 3, "different-scene");
  seed("other-project", 4, "workshop-developer", "different-project");
  const first = api.developerSession(project);
  const second = api.developerSession(project);
  assert.equal(await first, latest);
  assert.equal(await second, latest);
  assert.deepEqual(calls.opened, ["latest"]);
  assert.equal(calls.created.length, 0);
  assert.deepEqual(
    (await api.listDeveloperSessions(project.id)).map((item) => item.chatId),
    ["latest", "old"],
  );
});

test("new conversations keep prior history and receive the current project context and tools", async (t) => {
  const { api, project, seed, calls, values } = await fixture(t);
  const old = seed("old", 1);
  await api.developerSession(project);
  const created = await api.developerSession(project, { fresh: true });
  assert.notEqual(created.identity.id, old.identity.id);
  assert.deepEqual(
    (await api.listDeveloperSessions(project.id)).map((item) => item.chatId),
    ["old"],
  );
  assert.equal(await api.developerSession(project), created);
  assert.equal(values.get(`workshop:chat:${project.id}`), created.identity.id);
  assert.equal(calls.created[0].sceneId, "workshop-developer");
  assert.equal(
    JSON.parse(calls.created[0].profile.context.requestContext).revision,
    2,
  );
  assert.ok(
    calls.created[0].profile.allowedToolNames.includes("workshop_build"),
  );
  assert.deepEqual(calls.closed, []);
});

test("selecting an older conversation persists it across application reloads", async (t) => {
  const { api, project, seed, values } = await fixture(t);
  const old = seed("old", 1);
  seed("latest", 2);
  await api.developerSession(project);
  assert.equal(await api.developerSession(project, { chatId: "old" }), old);
  assert.equal(await api.developerSession(project), old);
  assert.equal(values.get(`workshop:chat:${project.id}`), "old");
  assert.equal(await (await loadAPI()).developerSession(project), old);
  values.set(`workshop:chat:${project.id}`, "deleted-chat");
  assert.equal(
    (await (await loadAPI()).developerSession(project)).identity.id,
    "latest",
  );
});

test("history cannot open another scene or project and failed switches preserve the active conversation", async (t) => {
  const { api, project, seed, calls, fail, values } = await fixture(t);
  const active = seed("active", 1);
  seed("other-scene", 3, "different-scene");
  seed("other-project", 4, "workshop-developer", "different-project");
  await api.developerSession(project);
  for (const chatId of ["missing", "other-scene", "other-project"])
    await assert.rejects(
      api.developerSession(project, { chatId }),
      /当前小应用/,
    );
  fail("无法新建会话");
  await assert.rejects(
    api.developerSession(project, { fresh: true }),
    /无法新建/,
  );
  assert.equal(await api.developerSession(project), active);
  assert.deepEqual(calls.opened, ["active"]);
  assert.equal(values.get(`workshop:chat:${project.id}`), "active");
});

test("a failed initial connection can retry without retaining a rejected session", async (t) => {
  const { api, project, seed, fail } = await fixture(t);
  const active = seed("active", 1);
  fail("暂时无法连接");
  await assert.rejects(api.developerSession(project), /暂时无法连接/);
  fail("");
  assert.equal(await api.developerSession(project), active);
});

test("project deletion closes every authoring conversation, including ones selected from history", async (t) => {
  const { api, project, seed, calls } = await fixture(t);
  seed("old", 1);
  seed("latest", 2);
  seed("other-scene", 3, "different-scene");
  await api.developerSession(project);
  const unsent = await api.developerSession(project, { fresh: true });
  await api.developerSession(project, { chatId: "old" });
  await api.closeProjectSessions(project.id);
  assert.deepEqual(
    calls.closed.sort(),
    ["latest", "old", unsent.identity.id].sort(),
  );
});
