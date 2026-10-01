import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { once } from "node:events";
import { startServer } from "../../dist/server.js";
import { token } from "../support/helpers.mjs";
const fixture = fileURLToPath(
  new URL("../support/fixtures/runtime.mjs", import.meta.url),
);
async function setup(t, runtimeOverrides = {}) {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "isle-migration-")),
  );
  const server = await startServer({
    port: 0,
    token,
    runtime: {
      dataDir: join(root, "data"),
      cliPath: fixture,
      ...runtimeOverrides,
    },
  });
  t.after(async () => {
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const raw = async (name, args = {}) => {
    const response = await fetch(server.url + "/api/commands/" + name, {
      method: "POST",
      headers: { authorization: "Bearer " + token },
      body: JSON.stringify(args),
    });
    return { status: response.status, value: await response.json() };
  };
  const call = async (name, input, bare = false) => {
    const r = await raw(
      name,
      bare ? (input ?? {}) : { input: { workspacePath: root, ...input } },
    );
    assert.equal(r.status, 200, JSON.stringify(r.value));
    return r.value;
  };
  return { root, server, raw, call };
}
test("every supported historical backend command has a Node command", async (t) => {
  const s = await setup(t);
  const names = JSON.parse(
    await fs.readFile(
      new URL("../support/fixtures/legacy-commands.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(names.length, 96);
  const response = await fetch(s.server.url + "/api/commands", {
    headers: { authorization: "Bearer " + token },
  });
  const { commands } = await response.json();
  const retired = [
    "get_ai_agent_settings",
    "save_ai_agent",
    "delete_ai_agent",
    "save_collaboration_workflow",
    "delete_collaboration_workflow",
  ];
  for (const name of retired) {
    assert.ok(names.includes(name));
    assert.equal(commands.includes(name), false);
  }
  assert.deepEqual(
    names.filter((n) => !retired.includes(n) && !commands.includes(n)),
    [],
  );
  assert.equal(new Set(commands).size, commands.length);
});
test("file transactions protect revision, traversal and original data; chats preserve origin and options", async (t) => {
  const s = await setup(t);
  await s.call("write_workspace_file", {
    relativePath: "story/project.json",
    content: '{"revision":1}',
  });
  await s.call("write_workspace_files_atomic", {
    files: [
      { relativePath: "story/project.json", content: '{"revision":2}' },
      { relativePath: "story/chapter.txt", content: "第一章" },
    ],
    revisionCondition: {
      relativePath: "story/project.json",
      expectedRevision: 1,
    },
  });
  assert.equal(
    (
      await s.raw("write_workspace_files_atomic", {
        input: {
          workspacePath: s.root,
          files: [{ relativePath: "story/chapter.txt", content: "bad" }],
          revisionCondition: {
            relativePath: "story/project.json",
            expectedRevision: 1,
          },
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await s.call("read_workspace_file", { relativePath: "story/chapter.txt" }))
      .content,
    "第一章",
  );
  assert.equal(
    (
      await s.raw("write_workspace_file", {
        input: {
          workspacePath: s.root,
          relativePath: "../escaped",
          content: "bad",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    await s.call("read_workspace_file_optional", {
      relativePath: "missing.txt",
    }),
    null,
  );
  const origin = {
    kind: "application",
    applicationId: "fixture",
    sceneId: "chat",
  };
  const chat = await s.call("save_chat", {
    chatId: "fixture-chat",
    workspaceId: "w",
    origin,
    messages: [{ role: "user", text: "你好" }],
    options: { model: "keep" },
  });
  assert.equal(chat.title, "你好");
  const saved = await s.call("save_chat", {
    chatId: chat.id,
    workspaceId: "w",
    origin: { sceneId: "chat", applicationId: "fixture", kind: "application" },
    messages: [],
  });
  assert.deepEqual(saved.options, { model: "keep" });
  assert.equal(
    (
      await s.raw("save_chat", {
        input: {
          workspacePath: s.root,
          chatId: chat.id,
          workspaceId: "w",
          origin: { kind: "builtin", sceneId: "chat" },
          messages: [],
        },
      })
    ).status,
    409,
  );
  await s.call("set_chat_unread", { chatId: chat.id, isUnread: true });
  assert.equal((await s.call("load_chat", { chatId: chat.id })).isUnread, true);
  assert.equal((await s.call("delete_chat", { chatId: chat.id })).length, 0);
});
test("Git interfaces commit selected files, inspect history, branch, discard and restore without moving HEAD", async (t) => {
  const s = await setup(t);
  assert.equal(
    (await s.call("get_workspace_version_control_status", {})).isEnabled,
    false,
  );
  await s.call("initialize_workspace_version_control", {});
  await fs.writeFile(join(s.root, ".gitignore"), "data/\n");
  await fs.writeFile(join(s.root, "chapter.txt"), "one\n");
  const first = await s.call("create_workspace_version", { message: "first" });
  assert.ok(first.version.id);
  await fs.writeFile(join(s.root, "chapter.txt"), "two\n");
  assert.equal(
    (
      await s.call("get_workspace_version_file_diff", {
        relativePath: "chapter.txt",
      })
    ).beforeContent,
    "one\n",
  );
  const second = await s.call("create_workspace_version", {
    message: "second",
    relativePaths: ["chapter.txt"],
  });
  assert.equal((await s.call("list_workspace_versions", {})).length, 2);
  assert.equal(
    (
      await s.call("list_workspace_version_files", {
        versionId: second.version.id,
      })
    )[0].path,
    "chapter.txt",
  );
  assert.equal(
    (
      await s.call("get_workspace_version_commit_file_diff", {
        versionId: second.version.id,
        relativePath: "chapter.txt",
      })
    ).afterContent,
    "two\n",
  );
  assert.equal(
    (
      await s.call("read_workspace_version_file", {
        versionId: first.version.id,
        relativePath: "chapter.txt",
      })
    ).content,
    "one\n",
  );
  await s.call("create_workspace_version_branch", { branchName: "draft" });
  await fs.writeFile(join(s.root, "chapter.txt"), "bad\n");
  await s.call("discard_workspace_version_file_changes", {
    relativePath: "chapter.txt",
  });
  assert.equal(await fs.readFile(join(s.root, "chapter.txt"), "utf8"), "two\n");
  const restored = await s.call("restore_workspace_version", {
    versionId: first.version.id,
  });
  assert.equal(restored.head, second.version.id);
  assert.equal(await fs.readFile(join(s.root, "chapter.txt"), "utf8"), "one\n");
});
test("database rebuild preserves matching records, keeps backups and exposes status", async (t) => {
  const s = await setup(t);
  const legacy = new DatabaseSync(join(s.root, "data/config.db"));
  legacy
    .prepare("INSERT INTO stories VALUES(?,?,?,?,?)")
    .run("legacy-story", "keep", join(s.root, "keep"), 1, 1);
  legacy.close();
  const result = await s.call("rebuild_config_database", {}, true);
  assert.equal(result.setupError, null);
  assert.ok(result.lastRebuild.restoredTables.includes("stories"));
  assert.ok(result.lastRebuild.warnings.some((x) => x.includes("backup-")));
  const restored = new DatabaseSync(join(s.root, "data/config.db"));
  assert.equal(
    restored.prepare("SELECT name FROM stories WHERE id='legacy-story'").get()
      .name,
    "keep",
  );
  restored.close();
  assert.equal(
    (await s.call("initialize_config_database", {}, true)).setupError,
    null,
  );
  const db = new DatabaseSync(join(s.root, "workspace.db"));
  db.exec("CREATE TABLE retired(id TEXT);INSERT INTO retired VALUES('keep');");
  db.close();
  const rebuilt = await s.call("rebuild_workspace_database", {});
  assert.deepEqual(rebuilt.rebuild.skippedTables, ["retired"]);
  const backup = rebuilt.rebuild.warnings
    .find((x) => x.includes("backup-"))
    .split("：")[1];
  const old = new DatabaseSync(backup, { readOnly: true });
  assert.equal(old.prepare("SELECT id FROM retired").get().id, "keep");
  old.close();
});
test("knowledge CRUD and persisted text/vector index use a real HTTP embedding contract", async (t) => {
  const s = await setup(t);
  let calls = 0;
  const embedding = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    const i = JSON.parse(body);
    calls++;
    assert.equal(req.url, "/v1/embeddings");
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        data: i.input.map((_, index) => ({ index, embedding: [1, 0, 0] })),
      }),
    );
  });
  embedding.listen(0, "127.0.0.1");
  await once(embedding, "listening");
  t.after(() => embedding.close());
  const docs = join(s.root, "knowledge");
  await fs.mkdir(docs);
  await fs.writeFile(
    join(docs, "chapter.md"),
    "月亮下的图书馆保存着古老的秘密。",
  );
  await s.call("save_knowledge_settings", { storageDirectory: docs });
  const profiles = await s.call("save_embedding_profile", {
    name: "test",
    providerKind: "openai-compatible",
    baseUrl: `http://127.0.0.1:${embedding.address().port}/v1`,
    modelId: "fixture",
    dimensions: 3,
  });
  const library = await s.call("save_knowledge_collection", {
    name: "Library",
    sourceDirectory: docs,
    enabled: true,
    embeddingProfileId: profiles[0].id,
  });
  const id = library.collections[0].id;
  assert.equal(library.sources.length, 1);
  assert.equal(
    (
      await s.call(
        "list_knowledge_collection_files",
        { collectionId: id },
        true,
      )
    )[0].relativePath,
    "chapter.md",
  );
  const rebuilt = await s.call("rebuild_knowledge_index", { collectionId: id });
  assert.equal(rebuilt.status.status, "ready", JSON.stringify(rebuilt));
  assert.equal(rebuilt.status.documentCount, 1);
  assert.equal(
    (await s.call("get_knowledge_index_status", { collectionId: id }, true))
      .chunkCount,
    1,
  );
  const result = await s.call("search_workspace_knowledge", {
    collectionIds: [id],
    query: "图书馆",
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].sourceType, "global_knowledge");
  assert.ok(calls >= 2);
  await s.call("save_embedding_profile", {
    ...profiles[0],
    modelId: "changed",
  });
  assert.equal(
    (await s.call("get_knowledge_index_status", { collectionId: id }, true))
      .status,
    "stale",
  );
  await s.call("delete_knowledge_collection", { collectionId: id }, true);
  assert.equal(
    (await s.call("list_knowledge_library", {}, true)).sources.length,
    0,
  );
});
test("application data ownership, workspace confirmation, revocation and package removal", async (t) => {
  const s = await setup(t);
  const packagePath = join(s.root, "fixture-package");
  await fs.mkdir(packagePath);
  const manifest = {
    name: "@test/app",
    version: "1.0.0",
    type: "module",
    isle: {
      app: { version: 1, entry: "index.js" },
      permissions: ["application-data", "application-workspaces", "chat", "embedded-views"],
      agentAccess: { process: { execute: false } },
    },
  };
  await fs.writeFile(
    join(packagePath, "package.json"),
    JSON.stringify(manifest),
  );
  await fs.writeFile(
    join(packagePath, "index.js"),
    'export default {name:"fixture",apply(){}};',
  );
  assert.equal(
    (await s.call("inspect_application", { sourcePath: packagePath })).id,
    "@test/app",
  );
  const installed = await s.call("install_application", {
    sourcePath: packagePath,
  });
  assert.equal(installed.enabled, true);
  assert.ok(installed.permissions.includes("embedded-views"));
  const connection = await s.call(
    "connect_application_data",
    { applicationId: installed.id },
    true,
  );
  const request = (method, params) =>
    s.call(
      "request_application_data",
      {
        connection,
        request: {
          version: 1,
          method,
          ...(params === undefined ? {} : { params }),
        },
      },
      true,
    );
  assert.deepEqual(
    await request("storage.setItem", { key: "state", value: { keep: true } }),
    { ok: true, value: null },
  );
  assert.deepEqual((await request("storage.getItem", { key: "state" })).value, {
    keep: true,
  });
  assert.deepEqual((await request("storage.keys")).value, ["state"]);
  const workspaces = await request("workspaces.list");
  assert.equal(workspaces.ok, true, JSON.stringify(workspaces));
  assert.equal(workspaces.value.length, 1);
  assert.equal(
    (await request("workspaces.get", { id: workspaces.value[0].id })).value
      .isDefault,
    true,
  );
  const shared = join(s.root, "shared");
  await fs.mkdir(join(shared, ".isle"), { recursive: true });
  await fs.writeFile(
    join(shared, ".isle", "workspace.json"),
    JSON.stringify({
      version: 1,
      id: "11111111-1111-4111-8111-111111111111",
      applications: ["other"],
      createdAt: 1,
    }),
  );
  let interaction;
  const unsubscribe = s.server.supervisor.events.subscribe((e) => {
    if (e.name === "application-workspace:interaction") interaction = e.payload;
  });
  const pending = request("workspaces.create", {
    name: "shared",
    path: shared,
  });
  for (let n = 0; n < 100 && !interaction; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(interaction.kind, "confirm-share");
  assert.equal(
    (
      await s.raw("answer_application_workspace_interaction", {
        input: { requestId: interaction.requestId, value: true },
      })
    ).status,
    200,
  );
  assert.equal((await pending).value.path, shared);
  unsubscribe();
  assert.equal(
    (await request("workspaces.remove", { id: workspaces.value[0].id })).ok,
    false,
  );
  const exclusivePath = join(s.root, "exclusive");
  const fresh = await request("workspaces.create", {
    name: "exclusive",
    path: exclusivePath,
    exclusive: true,
  });
  assert.equal(fresh.ok, true, JSON.stringify(fresh));
  await fs.writeFile(join(exclusivePath, "keep.txt"), "keep");
  assert.equal(
    (
      await request("workspaces.create", {
        name: "collision",
        path: exclusivePath,
        exclusive: true,
      })
    ).ok,
    false,
  );
  assert.equal(
    await fs.readFile(join(exclusivePath, "keep.txt"), "utf8"),
    "keep",
  );
  assert.equal(
    (
      await request("workspaces.remove", {
        id: fresh.value.id,
        deleteContent: true,
      })
    ).ok,
    true,
  );
  await assert.rejects(fs.stat(exclusivePath), { code: "ENOENT" });
  const sharedId = (await pending).value.id;
  assert.equal(
    (await request("workspaces.remove", { id: sharedId, deleteContent: true }))
      .ok,
    false,
  );
  assert.equal((await request("workspaces.remove", { id: sharedId })).ok, true);
  assert.deepEqual(
    JSON.parse(await fs.readFile(join(shared, ".isle/workspace.json"), "utf8"))
      .applications,
    ["other"],
  );
  assert.equal(
    (
      await request("workspaces.create", {
        name: "bad",
        path: shared,
        approved: true,
      })
    ).ok,
    false,
  );
  await s.call("set_application_enabled", { id: installed.id, enabled: false });
  assert.equal(
    (await request("storage.getItem", { key: "state" })).error.code,
    "PERMISSION_DENIED",
  );
  await s.call("set_application_enabled", { id: installed.id, enabled: true });
  const other = await s.call(
    "connect_application_data",
    { applicationId: installed.id },
    true,
  );
  assert.deepEqual(
    (
      await s.call(
        "request_application_data",
        {
          connection: other,
          request: {
            version: 1,
            method: "storage.getItem",
            params: { key: "state" },
          },
        },
        true,
      )
    ).value,
    { keep: true },
  );
  await s.call("remove_application", { id: installed.id });
  assert.ok(
    (
      await fs.stat(join(s.root, "data/apps/@test/app/storage.sqlite"))
    ).isFile(),
  );
});
test("real Node application host forwards SDK storage and tools, policies, UI and invalidates chat connections", async (t) => {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "isle-apphost-")),
  );
  const cli = fileURLToPath(
    new URL("../../../agent-runtime/dist/cli.js", import.meta.url),
  );
  const { runtimeConfig } = await import("../../dist/config/runtime.js");
  const { AgentRuntimeSupervisor } =
    await import("../../dist/modules/agent/runtime/supervisor.js");
  const { Applications } =
    await import("../../dist/modules/applications/service.js");
  const config = runtimeConfig({
    dataDir: join(root, "data"),
    cliPath: cli,
    bundledApplicationsPath: join(root, "none"),
  });
  const supervisor = new AgentRuntimeSupervisor(config);
  const apps = new Applications(config, supervisor);
  t.after(async () => {
    await apps.close();
    await supervisor.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = join(root, "source");
  await fs.mkdir(source);
  await fs.writeFile(
    join(source, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "1",
      type: "module",
      isle: {
        app: { version: 1, entry: "index.js" },
        permissions: ["application-data"],
        ui: { version: 1, kind: "sandbox", entry: "./ui.js" },
      },
    }),
  );
  await fs.writeFile(
    join(source, "ui.js"),
    'document.body.textContent="fixture";',
  );
  await fs.writeFile(
    join(source, "index.js"),
    `export default {name:'fixture',inject:['tools','storage'],apply(ctx){ctx.tools.register({name:'fixture_tool',description:'fixture',parameters:{type:'object',properties:{}},output:{schema:{type:'object'},render:()=>[]},async execute(){await ctx.storage.setItem('hello',{value:'world'});return await ctx.storage.getItem('hello');}});}};`,
  );
  await apps.packages.install(source);
  const catalog = await apps.host.invoke("catalog");
  assert.equal(catalog.applications.length, 1);
  assert.equal(catalog.applications[0].error, null, JSON.stringify(catalog));
  assert.equal(
    (
      await apps.host.invoke("execute", {
        applicationId: "fixture",
        toolName: "fixture_tool",
        arguments: {},
      })
    ).value.value,
    "world",
  );
  const policy = { allowedToolNames: ["fixture_tool"] };
  assert.deepEqual(
    await apps.host.invoke("toolPolicy.set", {
      applicationId: "fixture",
      policy,
    }),
    policy,
  );
  assert.deepEqual(
    await apps.host.invoke("toolPolicy.get", { applicationId: "fixture" }),
    policy,
  );
  assert.ok(await apps.host.invoke("uiDocument", { applicationId: "fixture" }));
  await apps.host.stop();
  await assert.rejects(
    async () =>
      apps.host.post({
        connectionId: "old",
        message: { type: "application-chat:response" },
      }),
    /更换/,
  );
});
test("bundled skills share one generic system group", async (t) => {
  const bundled = await fs.mkdtemp(join(tmpdir(), "isle-bundled-skills-"));
  t.after(() => fs.rm(bundled, { recursive: true, force: true }));
  for (const name of ["story-long-write", "bazi", "another-skill"]) {
    const path = join(bundled, name);
    await fs.mkdir(path);
    await fs.writeFile(join(path, "SKILL.md"), `# ${name}\n`);
  }
  const s = await setup(t, { bundledSkillsPath: bundled });
  const settings = await s.call("get_skills", {}, true);
  const systemGroups = settings.groups.filter(
    (group) => group.source === "system",
  );
  assert.deepEqual(
    systemGroups.map((group) => [group.id, group.name]),
    [["system-general", "系统技能"]],
  );
  assert.deepEqual(systemGroups[0].skills.map((skill) => skill.key).sort(), [
    "system:another-skill",
    "system:bazi",
    "system:story-long-write",
  ]);
  assert.equal(settings.defaultGroupId, "all");
  const saved = await s.call("save_skills", {
    defaultGroupId: "system-story-creation",
  });
  assert.equal(saved.defaultGroupId, "all");
});

test("skills zip installation, persisted groups and removal use the shared command contract", async (t) => {
  const s = await setup(t);
  const fixtureZip = JSON.parse(
    await fs.readFile(
      new URL("../support/fixtures/skill-zip.json", import.meta.url),
      "utf8",
    ),
  );
  const zip = join(s.root, "skill.zip");
  await fs.writeFile(zip, Buffer.from(fixtureZip.base64, "base64"));
  const installed = await s.call("install_skill_from_marketplace", {
    source: zip,
    sourceKind: "zip",
  });
  assert.equal(installed.name, "fixture-skill");
  const settings = await s.call("get_skills", {}, true);
  assert.ok(settings.skills.some((x) => x.key === "upload:fixture-skill"));
  const saved = await s.call("save_skills", {
    skillGroups: [
      {
        id: "01994c887e457a458144aeb91a96c335",
        name: "Fixtures",
        source: "custom",
        skills: [{ key: "upload:fixture-skill" }],
      },
    ],
    defaultGroupId: "01994c887e457a458144aeb91a96c335",
  });
  assert.ok(
    saved.groups.find((g) => g.id === "01994c887e457a458144aeb91a96c335")
      .isDefault,
  );
  const removed = await s.call("remove_app_skill", {
    key: "upload:fixture-skill",
  });
  assert.equal(removed.name, "fixture-skill");
  assert.equal((await s.call("get_skills", {}, true)).defaultGroupId, "all");
});
test("sandbox commands validate toggles and share persisted runtime settings", async (t) => {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "isle-sandbox-")),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    join(root, "sandbox-control.js"),
    "console.log(JSON.stringify({action:process.argv[2]}));",
  );
  const { Sandbox } = await import("../../dist/modules/agent/sandbox.js");
  const { runtimeConfig } = await import("../../dist/config/runtime.js");
  const commands = new Sandbox(
    runtimeConfig({ cliPath: join(root, "cli.js"), dataDir: root }),
  ).commands();
  assert.deepEqual(await commands.get_agent_runtime_sandbox_status({}), {
    action: "status",
  });
  assert.deepEqual(await commands.initialize_agent_runtime_sandbox({}), {
    action: "install",
  });
  assert.deepEqual(
    await commands.set_agent_runtime_sandbox_enabled({ enabled: false }),
    { action: "disable" },
  );
  assert.deepEqual(
    await commands.set_agent_runtime_sandbox_enabled({ enabled: true }),
    { action: "enable" },
  );
  for (const input of [
    {},
    { enabled: "false" },
    { enabled: null },
    { enabled: true, extra: 1 },
  ]) {
    assert.throws(() => commands.set_agent_runtime_sandbox_enabled(input), {
      status: 400,
    });
  }
  await fs.writeFile(
    join(root, "sandbox-control.js"),
    "console.log(JSON.stringify({settingsPath:process.env.ISLE_SANDBOX_SETTINGS_PATH}));",
  );
  assert.deepEqual(await commands.get_agent_runtime_sandbox_status({}), {
    settingsPath: join(root, "sandbox.json"),
  });
  const s = await setup(t);
  for (const input of [
    {},
    { enabled: "false" },
    { input: { enabled: false } },
  ]) {
    assert.equal(
      (await s.raw("set_agent_runtime_sandbox_enabled", input)).status,
      400,
    );
  }
});
test("corrupt configuration can be inspected and rebuilt without preventing Server startup", async (t) => {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "isle-db-recovery-")),
  );
  const dataDir = join(root, "data");
  await fs.mkdir(dataDir);
  await fs.writeFile(join(dataDir, "config.db"), "original-corrupt-content");
  const s = await startServer({
    token,
    port: 0,
    runtime: { cliPath: fixture, dataDir },
  });
  t.after(async () => {
    await s.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const call = async (name) => {
    const r = await fetch(s.url + "/api/commands/" + name, {
      method: "POST",
      headers: { authorization: "Bearer " + token },
      body: "{}",
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  assert.ok((await call("get_config_database_status")).setupError);
  const rebuilt = await call("rebuild_config_database");
  assert.equal(rebuilt.setupError, null);
  const backup = rebuilt.lastRebuild.warnings
    .find((x) => x.startsWith("旧数据库备份："))
    .split("：")[1];
  assert.equal(await fs.readFile(backup, "utf8"), "original-corrupt-content");
});
test("application Agent binding injects only its owner permissions and disable cancels its worker", async (t) => {
  const s = await setup(t);
  const source = join(s.root, "owner");
  await fs.mkdir(source);
  await fs.writeFile(
    join(source, "package.json"),
    JSON.stringify({
      name: "owner",
      version: "1",
      type: "module",
      isle: {
        app: { version: 1, entry: "index.js" },
        permissions: ["chat"],
        agentAccess: { process: { execute: false } },
      },
    }),
  );
  await fs.writeFile(
    join(source, "index.js"),
    'export default {name:"owner",apply(){}}',
  );
  await s.call("install_application", { sourcePath: source });
  await s.call("run_agent_runtime_agent", {
    taskId: "owned-task",
    applicationId: "owner",
    userMessage: "hold",
    sessionRootDir: "sessions/owned",
  });
  for (
    let n = 0;
    n < 100 &&
    s.server.supervisor.snapshot("owned-task")?.taskState !== "running";
    n++
  )
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(s.server.supervisor.snapshot("owned-task").taskState, "running");
  await s.call("set_application_enabled", { id: "owner", enabled: false });
  for (
    let n = 0;
    n < 100 &&
    s.server.supervisor.snapshot("owned-task")?.taskState !== "cancelled";
    n++
  )
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(
    s.server.supervisor.snapshot("owned-task").taskState,
    "cancelled",
  );
  assert.equal(
    (
      await s.raw("run_agent_runtime_agent", {
        input: {
          workspacePath: s.root,
          taskId: "rejected",
          applicationId: "owner",
          userMessage: "ok",
        },
      })
    ).status,
    403,
  );
});
test("database rebuild refuses a locked source instead of replacing it with an empty database", async (t) => {
  const s = await setup(t);
  const path = join(s.root, "data/config.db");
  const db = new DatabaseSync(path);
  db.exec("BEGIN EXCLUSIVE");
  try {
    assert.equal((await s.raw("rebuild_config_database", {})).status, 503);
  } finally {
    db.exec("ROLLBACK");
    db.close();
  }
  assert.equal(
    (await s.call("get_config_database_status", {}, true)).setupError,
    null,
  );
});
test("file watchers publish change IDs and failed batches restore already replaced files", async (t) => {
  const s = await setup(t);
  let event;
  const unsubscribe = s.server.supervisor.events.subscribe((e) => {
    if (e.name === "workspace_files_changed") event = e;
  });
  const watchId = await s.call("watch_workspace_files", {});
  await fs.writeFile(join(s.root, "watched.txt"), "before");
  for (let n = 0; n < 100 && !event; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(event.payload.watchId, watchId);
  await s.call("unwatch_workspace_files", { watchId });
  unsubscribe();
  if (process.platform === "win32") return;
  const locked = join(s.root, "locked");
  await fs.mkdir(locked);
  await fs.chmod(locked, 0o500);
  try {
    const response = await s.raw("write_workspace_files_atomic", {
      input: {
        workspacePath: s.root,
        files: [
          { relativePath: "watched.txt", content: "after" },
          { relativePath: "locked/fails.txt", content: "fail" },
        ],
      },
    });
    assert.equal(response.status, 500);
    assert.equal(
      await fs.readFile(join(s.root, "watched.txt"), "utf8"),
      "before",
    );
  } finally {
    await fs.chmod(locked, 0o700);
  }
});
test("generic Node helpers bound timeout and spawn failures", async () => {
  const { command } =
    await import("../../dist/infrastructure/process/command.js");
  const begin = Date.now();
  await assert.rejects(
    command(
      process.execPath,
      ["-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
      { timeout: 50 },
    ),
    { code: "COMMAND_TIMEOUT" },
  );
  assert.ok(Date.now() - begin < 2000);
  await assert.rejects(command("/nonexistent/isle-fixture-command", []), {
    code: "COMMAND_UNAVAILABLE",
  });
});
test("Server data directory lease prevents concurrent hosts and releases on shutdown", async (t) => {
  const s = await setup(t);
  const options = {
    token,
    port: 0,
    runtime: { dataDir: join(s.root, "data"), cliPath: fixture },
  };
  await assert.rejects(startServer(options), { code: "SERVER_DATA_IN_USE" });
  await s.server.close();
  const restarted = await startServer(options);
  await restarted.close();
});
