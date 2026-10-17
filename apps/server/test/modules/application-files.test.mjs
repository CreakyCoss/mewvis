import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  link,
  readdir,
  rm,
  realpath,
  rename,
  copyFile,
  cp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ApplicationHost } from "../../dist/modules/applications/host.js";
import { AgentRuntimeSupervisor } from "../../dist/modules/agent/runtime/supervisor.js";
import { runtimeConfig } from "../../dist/config/runtime.js";
import { createApplicationDataClient } from "../../../../packages/app/sdk/data/index.js";
import { ApplicationFiles } from "../../dist/modules/files/application-files.js";
import {
  applicationProtectedPaths,
  hostProtectedPaths,
} from "../../dist/modules/files/util.js";
import { ApplicationData } from "../../dist/modules/applications/data.js";
import { applicationDirectory } from "../../dist/modules/applications/packages.js";
import { EventHub } from "../../dist/infrastructure/events/event-hub.js";
import { createApplicationFileClient } from "../../../../packages/app/sdk/files/index.js";
import { startHttpServer } from "../../dist/transport/http/server.js";
import { CommandRegistry } from "../../dist/transport/commands/registry.js";
import { setup, token, waitFor } from "../support/helpers.mjs";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "mewvis-files-")));
  const events = new EventHub();
  const registered = new Map(
    ["a", "b"].map((id) => [
      id,
      {
        id,
        enabled: true,
        permissions: [
          "workspace-files",
          "application-workspaces",
          "application-data",
        ],
      },
    ]),
  );
  const packages = {
    path: join(root, "apps"),
    async authorize(id, permission) {
      const app = registered.get(id);
      if (
        !app?.enabled ||
        (permission && !app.permissions.includes(permission))
      ) {
        const error = new Error("denied");
        error.code = "PERMISSION_DENIED";
        throw error;
      }
      return app;
    },
  };
  await mkdir(packages.path, { recursive: true });
  const data = new ApplicationData(packages, events);
  const bindings = new Map();
  for (const id of ["a", "b"]) {
    const connection = await data.connect(id);
    const result = await data.request(connection, {
      version: 1,
      method: "workspaces.create",
      params: {
        name: id,
        path: join(root, `workspace-${id}`),
        exclusive: true,
      },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    bindings.set(id, result.value);
  }
  const files = new ApplicationFiles(async (id) => {
    if (id === null)
      return {
        dataPath: join(root, "host-data"),
        workspacePaths: [join(root, "host-workspace")],
        protectedPaths: [],
      };
    const app = await packages.authorize(id, "workspace-files");
    const dataPath = applicationDirectory(packages.path, app.id);
    return {
      dataPath,
      workspacePaths: await data.fileWorkspaces(id),
      protectedPaths: applicationProtectedPaths(
        dataPath,
        await data.fileWorkspaces(id),
      ),
    };
  }, events);
  const connections = new Map(),
    clients = new Map();
  for (const id of ["a", "b"]) {
    const connection = await files.connect(id);
    connections.set(id, connection);
    clients.set(
      id,
      createApplicationFileClient({
        version: 1,
        async request(request) {
          try {
            return {
              ok: true,
              value: await files.request(connection, request),
            };
          } catch (error) {
            return {
              ok: false,
              error: {
                code: error.code ?? "FILE_ERROR",
                message: error.message,
              },
            };
          }
        },
      }),
    );
  }
  t.after(async () => {
    await files.close();
    data.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    files,
    clients,
    connections,
    bindings,
    registered,
    data,
    events,
    packages,
  };
}
const denied = (promise) =>
  assert.rejects(promise, (error) => error.code === "PERMISSION_DENIED");

test(
  "agent application tools use the real scoped host for image, video and speech registration",
  { timeout: 60_000 },
  async (t) => {
    const f = await fixture(t);
    const runtimeRoot = fileURLToPath(
      new URL("../../../agent-runtime/", import.meta.url),
    );
    const require = createRequire(join(runtimeRoot, "package.json"));
    const { build } = require("esbuild");
    const { dshBundleCompatibilityPlugin } = await import(
      pathToFileURL(require.resolve("@mewvis/app-dev/dsh"))
    );
    const entries = JSON.parse(
      await readFile(join(runtimeRoot, "build-entries.json"), "utf8"),
    );
    const runtimeDirectory = join(f.root, "runtime");
    await mkdir(join(runtimeDirectory, "app-host"), { recursive: true });
    await writeFile(
      join(runtimeDirectory, "package.json"),
      '{"type":"module"}',
    );
    await copyFile(
      new URL(
        "../../../../packages/app/host/dist/service.mjs",
        import.meta.url,
      ),
      join(runtimeDirectory, "app-host/service.mjs"),
    );
    const common = {
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      plugins: [dshBundleCompatibilityPlugin],
      banner: {
        js: "import {createRequire as __testRequire} from 'node:module'; const require = __testRequire(import.meta.url);",
      },
    };
    await build({
      ...common,
      stdin: {
        contents: [
          "engines/drivers/native/agent/runtimes/pi/tools/index.ts",
          "cli/application-tools.ts",
          "security/access/index.ts",
          "security/execution/index.ts",
          "security/safety/index.ts",
        ]
          .map(
            (path) =>
              `export * from ${JSON.stringify(join(runtimeRoot, "src", path))};`,
          )
          .join("\n"),
        resolveDir: runtimeRoot,
        loader: "ts",
      },
      outfile: join(runtimeDirectory, "tools.js"),
    });
    for (const entry of [entries.executionHost, entries.piToolWorker])
      await build({
        ...common,
        entryPoints: [join(runtimeRoot, entry.source)],
        outfile: join(runtimeDirectory, entry.output),
      });
    const api = await import(pathToFileURL(join(runtimeDirectory, "tools.js")));
    const { fixture: film } =
      await import("../../../applications/builtins/film-workshop/test/fixture.mjs");
    const packageSource = fileURLToPath(
      new URL(
        "../../../applications/builtins/film-workshop/dist/mewvis/",
        import.meta.url,
      ),
    );
    const packageRoot = join(f.root, "film-package");
    await cp(packageSource, packageRoot, { recursive: true });
    const manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    Object.assign(f.registered.get("a"), {
      path: packageRoot,
      entry: join(packageRoot, "index.js"),
      runtimeKind: "mewvis",
      name: "Film",
      version: "1.0.0",
      description: "",
      source: "builtin",
      permissionStatus: "declared",
    });
    f.registered.get("a").permissions.push("chat");
    f.registered.get("b").enabled = false;
    f.packages.list = async () => [...f.registered.values()];
    const config = runtimeConfig({
      cliPath: join(runtimeDirectory, "cli.js"),
      dataDir: join(f.root, "server-data"),
    });
    const supervisor = new AgentRuntimeSupervisor(config);
    const host = new ApplicationHost(
      config,
      f.packages,
      f.data,
      f.events,
      f.files,
    );
    supervisor.setApplicationToolHandler((call) =>
      host.invoke("execute", call),
    );
    t.after(async () => {
      await supervisor.close();
      await host.close();
    });
    const dataConnection = await f.data.connect("a");
    const data = createApplicationDataClient({
      version: 1,
      request: (request) => f.data.request(dataConnection, request),
    });
    const project = film.exampleProject();
    const workspace = f.bindings.get("a");
    project.workspace = {
      id: workspace.id,
      root: workspace.path,
      directory: join(workspace.path, "film-projects", project.id),
    };
    await f.clients.get("a").mkdir(project.workspace.directory);
    const episode = project.episodes[0],
      shot = episode.shots[2];
    const source = await film
      .createAssistantStore(data.storage, f.clients.get("a"))
      .prepare(
        project,
        episode.id,
        "real-agent-chat",
        film.assistantContext(project, episode, "dubbing", shot.id)
          .requestContext,
      );
    const taskId = "real-application-tools";
    const declarations = await host.invoke("runtimeResources", {
      applicationId: "a",
      cwd: workspace.path,
    });
    assert.equal(declarations.id, "a");
    assert(declarations.skills.length > 0);
    assert(!("entry" in declarations) && !("packageRoot" in declarations));
    // Host already loaded the implementation. Agent must work even when the module entry no longer exists.
    await rename(
      join(packageRoot, "index.js"),
      join(packageRoot, "loaded-by-host.js"),
    );
    const resources = {
      applications: {
        items: [declarations],
      },
      tools: { allowed: ["film_prepare_media"] },
    };
    const task = {
      taskId,
      applicationId: "a",
      sessionKey: "film",
      workspacePath: workspace.path,
      command: supervisor.protocol.command(
        "agent/run",
        {
          taskId,
          workspacePath: workspace.path,
          userMessage: "test",
          resources,
        },
        taskId,
      ),
    };
    const channel = new api.ApplicationToolChannel((message) => {
      const decoded = supervisor.protocol.decode(JSON.stringify(message));
      assert.equal(decoded.kind, "application-tool");
      void supervisor.executeApplicationTool(task, decoded.value).then(
        (result) =>
          channel.receive(
            JSON.stringify({ jsonrpc: "2.0", id: decoded.id, result }),
          ),
        (error) =>
          channel.receive(
            JSON.stringify({
              jsonrpc: "2.0",
              id: decoded.id,
              error: { code: -32000, message: error.message },
            }),
          ),
      );
    });
    t.after(() => channel.close());
    let captured;
    const isolated = new api.ApplicationToolChannel((message) => {
      captured = message;
    });
    t.after(() => isolated.close());
    const channelCall = {
      taskId,
      applicationId: "a",
      callId: "channel",
      toolName: "film_prepare_media",
      arguments: {},
    };
    const malformed = isolated.execute(channelCall);
    isolated.receive(
      JSON.stringify({ jsonrpc: "2.0", id: captured.id, result: {} }),
    );
    await assert.rejects(malformed, /响应无效/);
    const controller = new AbortController();
    const cancelled = isolated.execute(channelCall, controller.signal);
    const cancelledId = captured.id;
    controller.abort();
    await assert.rejects(cancelled, /已取消/);
    assert.equal(
      isolated.receive(
        JSON.stringify({
          jsonrpc: "2.0",
          id: cancelledId,
          result: { value: {}, content: [] },
        }),
      ),
      true,
    );
    const access = api.resolveAgentAccess(manifest.mewvis.agentAccess, {
      workspacePath: workspace.path,
    });
    const execution = api.resolveExecutionPolicy(
      "auto",
      workspace.path,
      { ...api.EXECUTION_CONFIG, enabled: false },
      runtimeDirectory,
      { access },
    );
    // The agent worker cannot read the application data root; only the scoped host can.
    const appData = (await f.clients.get("a").roots()).dataPath;
    assert.equal(api.accessAllowsPath(access.filesystem.read, appData), false);
    const toolSet = await api.createPiToolSet(
      {
        taskId,
        workspacePath: workspace.path,
        userMessage: "test",
        agentTaskPrompt: "test",
        runtimeMode: "agent",
        resources,
      },
      {
        requestUserInput: async () => null,
        executeApplicationTool: (call, signal) => channel.execute(call, signal),
      },
      {
        policies: {
          access,
          execution,
          safety: api.resolveSafetyPolicy("auto", workspace.path),
        },
      },
    );
    t.after(() => toolSet.dispose());
    const tool = toolSet.tools.find(
      (item) => item.name === "film_prepare_media",
    );
    assert(tool);
    for (const purpose of ["image-generation", "video-generation", "speech"]) {
      const result = await tool.execute(purpose, {
        contextId: source.id,
        chatId: source.chatId,
        purpose,
      });
      assert.match(result.details.value.instruction, /generated\//);
      assert.match(result.content[0].text, /requestId/);
    }
    const jobs = await film
      .createMediaRequestStore(data.storage)
      .unread(project, new Set());
    assert.equal(jobs.length, 3);
    assert(
      jobs.every(
        ({ job }) => job.shotId === shot.id && job.chatId === source.chatId,
      ),
    );
    // Exercise the production CLI callback wiring as well as the direct tool adapter.
    const modelRequests = [],
      events = [];
    const model = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      modelRequests.push(input);
      const replied = input.messages.at(-1).role === "tool";
      const delta = replied
        ? { content: "registered" }
        : {
            tool_calls: [
              {
                index: 0,
                id: "film-prepare",
                type: "function",
                function: {
                  name: "film_prepare_media",
                  arguments: JSON.stringify({
                    contextId: source.id,
                    chatId: source.chatId,
                    purpose: "speech",
                  }),
                },
              },
            ],
          };
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ id: "film", object: "chat.completion.chunk", created: 1, model: "local", choices: [{ index: 0, delta, finish_reason: replied ? "stop" : "tool_calls" }] })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    });
    model.listen(0, "127.0.0.1");
    await once(model, "listening");
    t.after(() => new Promise((resolve) => model.close(resolve)));
    const cliConfig = runtimeConfig({
      cliPath: join(runtimeRoot, "dist/cli.js"),
      dataDir: join(f.root, "cli-data"),
    });
    await mkdir(cliConfig.dataDir);
    await writeFile(
      join(cliConfig.dataDir, "sandbox.json"),
      '{"enabled":false}',
    );
    const cli = new AgentRuntimeSupervisor(cliConfig);
    t.after(() => cli.close());
    cli.events.subscribe((event) => events.push(event));
    cli.setApplicationToolHandler((call) => host.invoke("execute", call));
    const cliTaskId = "cli-application-tool";
    cli.submit({
      taskId: cliTaskId,
      applicationId: "a",
      sessionKey: "cli-film",
      workspacePath: workspace.path,
      command: cli.protocol.command(
        "agent/run",
        {
          taskId: cliTaskId,
          workspacePath: workspace.path,
          sessionRootDir: join(workspace.path, ".mewvis/sessions/film-test"),
          agentRoleId: "main",
          userMessage: "prepare speech",
          resources,
          permissions: { mode: "auto" },
          agentAccess: manifest.mewvis.agentAccess,
          runtimeModel: {
            provider: "openai",
            modelId: "local",
            catalogModelId: "local",
            apiFormat: "openai-completions",
            apiKey: "test",
            apiEndpoint: `http://127.0.0.1:${model.address().port}/v1`,
            reasoning: false,
          },
        },
        cliTaskId,
      ),
    });
    await waitFor(
      () => ["done", "failed"].includes(cli.snapshot(cliTaskId)?.taskState),
      "CLI application tool",
      30_000,
    );
    assert.equal(
      cli.snapshot(cliTaskId).taskState,
      "done",
      JSON.stringify(events),
    );
    const toolEvent = events.find(
      (e) => e.payload.event.type === "tool_execution_end",
    );
    assert.equal(
      toolEvent.payload.event.isError,
      false,
      JSON.stringify(toolEvent),
    );
    assert.match(JSON.stringify(toolEvent.payload.event.result), /requestId/);
    assert.equal(modelRequests.length, 2);
    assert.match(JSON.stringify(modelRequests[0].messages), /已加载应用技能/);
    await cli.close();

    const call = {
      taskId,
      applicationId: "a",
      callId: "denied",
      toolName: "film_prepare_media",
      arguments: {},
    };
    await denied(
      supervisor.executeApplicationTool(task, { ...call, applicationId: "b" }),
    );
    await denied(
      supervisor.executeApplicationTool(task, {
        ...call,
        toolName: "film_propose_changes",
      }),
    );
    await denied(
      supervisor.executeApplicationTool(
        { ...task, applicationId: undefined },
        call,
      ),
    );
    await assert.rejects(
      api.createPiToolSet(
        {
          taskId,
          workspacePath: workspace.path,
          resources,
          runtimeMode: "agent",
        },
        {
          requestUserInput: async () => null,
        },
        {
          policies: {
            access,
            execution,
            safety: api.resolveSafetyPolicy("auto", workspace.path),
          },
        },
      ),
      /未连接应用宿主/,
    );
    await host.invoke("toolPolicy.set", {
      applicationId: "a",
      policy: { allowedToolNames: [] },
    });
    assert.deepEqual(
      (await host.invoke("runtimeResources", { applicationId: "a" })).tools,
      [],
    );
    await assert.rejects(
      tool.execute("disabled", {
        contextId: source.id,
        chatId: source.chatId,
        purpose: "speech",
      }),
      /已禁用/,
    );
    await host.invoke("toolPolicy.set", {
      applicationId: "a",
      policy: { allowedToolNames: declarations.tools.map((tool) => tool.name) },
    });
    f.registered.get("a").permissions = [];
    await assert.rejects(
      tool.execute("revoked", {
        contextId: source.id,
        chatId: source.chatId,
        purpose: "speech",
      }),
      /denied|权限|文件操作失败/,
    );
  },
);

test("real per-application SQLite registration resolves only the caller's roots", async (t) => {
  const f = await fixture(t),
    a = f.clients.get("a"),
    b = f.clients.get("b");
  assert.deepEqual((await a.roots()).workspacePaths, [
    f.bindings.get("a").path,
  ]);
  const file = join((await a.roots()).dataPath, "files", "hello.txt");
  await a.writeText(file, "你好");
  assert.equal(await a.readText(file), "你好");
  await denied(b.readText(file));
  await denied(b.writeText(file, "changed", { overwrite: true }));
  const outside = join(f.root, "outside.txt");
  await denied(a.writeText(outside, "blocked"));
  await assert.rejects(readFile(outside), { code: "ENOENT" });
  await denied(a.readText(join(f.bindings.get("b").path, "file.txt")));
  await denied(
    a.writeText(join((await a.roots()).dataPath, "storage.sqlite"), "corrupt", {
      overwrite: true,
    }),
  );
  await denied(
    a.writeText(
      join(f.bindings.get("a").path, ".mewvis", "workspace.json"),
      "corrupt",
      { overwrite: true },
    ),
  );
  await denied(a.remove((await a.roots()).dataPath));
});

test("text and large binary round trips use bounded chunks and atomic commits", async (t) => {
  const f = await fixture(t),
    client = f.clients.get("a"),
    path = join(f.bindings.get("a").path, "assets", "large.bin");
  const bytes = Uint8Array.from({ length: 500_123 }, (_, index) => index % 251);
  await client.writeBinary(path, bytes);
  assert.deepEqual(await client.readBinary(path), bytes);
  await assert.rejects(
    client.readBinary(path, { maxBytes: 1024 }),
    (e) => e.code === "LIMIT_EXCEEDED",
  );
  await assert.rejects(
    client.writeText(path, "replace"),
    (e) => e.code === "FILE_EXISTS",
  );
  assert.deepEqual(await client.readBinary(path), bytes);
  const id = await client.beginWrite(path, { overwrite: true });
  await client.writeChunk(id, 0, new TextEncoder().encode("new"));
  assert.deepEqual(await readFile(path), Buffer.from(bytes));
  await client.abortWrite(id);
  assert.deepEqual(await readFile(path), Buffer.from(bytes));
  const stat = await client.stat(path);
  await client.writeText(path, "replacement", {
    overwrite: true,
    expectedModifiedAt: stat.modifiedAt,
  });
  await assert.rejects(
    client.writeText(path, "stale", {
      overwrite: true,
      expectedModifiedAt: stat.modifiedAt,
    }),
    (e) => e.code === "FILE_CHANGED",
  );
  assert.equal(await client.readText(path), "replacement");
  assert.equal(
    (await readdir(join(f.bindings.get("a").path, "assets"))).some((name) =>
      name.startsWith(".mewvis-save-"),
    ),
    false,
  );
});

test("copy/move check both paths, preserve existing destinations and support empty directory removal", async (t) => {
  const f = await fixture(t),
    client = f.clients.get("a"),
    root = f.bindings.get("a").path;
  const source = join(root, "source.txt"),
    copy = join(root, "copy.txt"),
    moved = join(root, "moved.txt");
  await client.writeText(source, "source");
  await client.copy(source, copy);
  await assert.rejects(
    client.copy(source, copy),
    (e) => e.code === "FILE_EXISTS",
  );
  await denied(client.copy(source, join(f.root, "outside.txt")));
  await denied(
    client.move(join(f.bindings.get("b").path, "source.txt"), moved),
  );
  await client.move(copy, moved);
  assert.equal(await client.readText(moved), "source");
  await assert.rejects(client.stat(copy), (e) => e.code === "FILE_NOT_FOUND");
  await client.mkdir(join(root, "empty"));
  await client.remove(join(root, "empty"));
  const listed = await client.list(root);
  assert.ok(listed.some((entry) => entry.name === "moved.txt"));
});

test("symlink, parent traversal and hardlink aliases cannot escape or mutate another root", async (t) => {
  const f = await fixture(t),
    client = f.clients.get("a"),
    root = f.bindings.get("a").path;
  const outside = join(f.root, "outside");
  await mkdir(outside);
  await writeFile(join(outside, "secret.txt"), "secret");
  await symlink(outside, join(root, "escape"), "dir");
  await denied(client.readText(join(root, "escape", "secret.txt")));
  await denied(client.writeText(join(root, "escape", "new.txt"), "bad"));
  await assert.rejects(
    client.stat(`${root}/../outside/secret.txt`),
    (e) => e.code === "INVALID_ARGUMENT",
  );
  await link(join(outside, "secret.txt"), join(root, "alias.txt"));
  await assert.rejects(
    client.readText(join(root, "alias.txt")),
    (e) => e.code === "INVALID_FILE",
  );
  await denied(
    client.writeText(join(root, "alias.txt"), "bad", { overwrite: true }),
  );
  assert.equal(await readFile(join(outside, "secret.txt"), "utf8"), "secret");
});

test("revoke/disconnect cleans staged writes and prevents old connections from accessing files", async (t) => {
  const f = await fixture(t),
    client = f.clients.get("a"),
    root = f.bindings.get("a").path;
  const id = await client.beginWrite(join(root, "unfinished.txt"));
  await client.writeChunk(id, 0, Uint8Array.of(1, 2));
  const path = join(root, "preview.txt");
  await client.writeText(path, "preview");
  const preview = await client.preview.openDialog({ filePath: path });
  await denied(f.clients.get("b").preview.close(preview.id));
  await f.files.revoke("a");
  await denied(client.readText(path));
  await assert.rejects(
    f.files.describePreview(preview.id),
    (e) => e.code === "PREVIEW_EXPIRED",
  );
  assert.equal(
    (await readdir(root)).some((name) => name.startsWith(".mewvis-save-")),
    false,
  );
});

test("host caller uses its own data/workspace roots without enrolling an application", async (t) => {
  const f = await fixture(t),
    connection = await f.files.connect(null);
  const root = await f.files.request(connection, {
    version: 1,
    method: "roots",
  });
  assert.equal(root.dataPath, join(f.root, "host-data"));
  await denied(
    f.clients.get("a").writeText(join(root.dataPath, "file.txt"), "bad"),
  );
});

test("shared protected paths block managed application/host files and SQLite sidecars while leaving business files writable", async (t) => {
  const f = await fixture(t),
    app = f.clients.get("a");
  const dataPath = (await app.roots()).dataPath;
  const workspace = f.bindings.get("a").path;
  for (const file of [
    join(dataPath, "package", "index.js"),
    join(dataPath, "settings.yaml"),
    ...["", "-wal", "-shm", "-journal"].map((suffix) =>
      join(dataPath, "storage.sqlite" + suffix),
    ),
    ...["", "-wal", "-shm", "-journal"].map((suffix) =>
      join(workspace, "workspace.db" + suffix),
    ),
  ])
    await denied(app.writeText(file, "corrupt", { overwrite: true }));

  const hostData = join(f.root, "isolated-host"),
    hostWorkspace = join(f.root, "isolated-host-workspace");
  const installed = join(hostData, "apps", "example");
  const files = new ApplicationFiles(
    async () => ({
      dataPath: hostData,
      workspacePaths: [hostWorkspace],
      protectedPaths: hostProtectedPaths(
        hostData,
        [installed],
        [hostWorkspace],
      ),
    }),
    f.events,
  );
  t.after(() => files.close());
  const connection = await files.connect(null);
  const host = createApplicationFileClient({
    version: 1,
    async request(request) {
      return { ok: true, value: await files.request(connection, request) };
    },
  });
  for (const file of [
    ...["", "-wal", "-shm", "-journal"].map((suffix) =>
      join(hostData, "config.db" + suffix),
    ),
    join(installed, "package", "entry.js"),
    join(installed, "settings.yaml"),
    join(installed, "storage.sqlite-wal"),
    join(installed, "workspace", "workspace.db-shm"),
    join(hostWorkspace, "workspace.db-journal"),
  ])
    await denied(host.writeText(file, "corrupt", { overwrite: true }));
  const businessFile = join(installed, "files", "data.json");
  await host.writeText(businessFile, "{}");
  assert.equal(await host.readText(businessFile), "{}");
});

test("preview streams support authenticated setup, scoped URLs, HEAD/ranges and revocation", async (t) => {
  const f = await fixture(t),
    client = f.clients.get("a");
  const path = join(f.bindings.get("a").path, "clip.mp4");
  await client.writeBinary(
    path,
    Uint8Array.from({ length: 1024 }, (_, i) => i % 251),
  );
  const preview = await client.preview.openDialog({ filePath: path });
  assert.equal(preview.kind, "video");
  const description = await f.files.describePreview(preview.id);
  const { supervisor } = await setup(t);
  const http = await startHttpServer({
    token,
    port: 0,
    commands: new CommandRegistry(),
    supervisor,
    filePreviews: f.files,
    shutdown: async () => {},
    dispose() {},
  });
  t.after(() => http.close());
  const url = `${http.url}/api/${description.resourcePath}`;
  const range = await fetch(url, { headers: { range: "bytes=100-199" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 100-199/1024");
  assert.deepEqual(
    new Uint8Array(await range.arrayBuffer()),
    Uint8Array.from({ length: 100 }, (_, i) => (100 + i) % 251),
  );
  for (const value of ["bytes=0-1", "bytes=2-", "bytes=-20"]) {
    const next = await fetch(url, { headers: { range: value } });
    assert.equal(next.status, 206, await next.clone().text());
    assert.ok((await next.arrayBuffer()).byteLength > 0);
  }
  const opaque = await fetch(url, {
    headers: { origin: "null", range: "bytes=0-1" },
  });
  assert.equal(opaque.status, 206);
  assert.equal(opaque.headers.get("access-control-allow-origin"), "*");
  assert.equal((await opaque.arrayBuffer()).byteLength, 2);
  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: {
      origin: "null",
      "access-control-request-method": "GET",
      "access-control-request-headers": "range",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    (
      await fetch(`${http.url}/api/commands/connect_host_files`, {
        method: "POST",
        headers: { origin: "null", "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "1024");
  const invalid = await fetch(url, { headers: { range: "bytes=2000-3000" } });
  assert.equal(invalid.status, 416);
  const wrong = await fetch(url.replace(/[a-f0-9]{64}$/, "0".repeat(64)));
  assert.equal(wrong.status, 403);
  await client.preview.close(preview.id);
  assert.equal((await fetch(url)).status, 403);
  const next = await client.preview.openDialog({ filePath: path });
  const resource = await f.files.describePreview(next.id);
  await writeFile(path, "changed");
  assert.equal(
    (await fetch(`${http.url}/api/${resource.resourcePath}`)).status,
    409,
  );
});

test("inline previews enforce the same access gate and lifecycle without opening a dialog", async (t) => {
  const f = await fixture(t),
    client = f.clients.get("a");
  const path = join(f.bindings.get("a").path, "inline.txt");
  await client.writeText(path, "inline contents");
  const opened = [];
  t.after(
    f.events.subscribe((event) => {
      if (event.name === "application-file-preview:open")
        opened.push(event.payload.id);
    }),
  );
  const inline = await client.preview.create({
    filePath: path,
  });
  assert.equal((await f.files.describePreview(inline.id)).kind, "text");
  await denied(f.clients.get("b").preview.describe(inline.id));
  assert.deepEqual(opened, []);
  await denied(
    client.preview.create({
      filePath: join(f.root, "outside.txt"),
    }),
  );
  await assert.rejects(
    f.files.request(f.connections.get("a"), {
      version: 1,
      method: "preview.create",
      params: { filePath: path, unexpected: true },
    }),
    { code: "INVALID_ARGUMENT" },
  );
  const dialog = await client.preview.openDialog({ filePath: path });
  assert.deepEqual(opened, [dialog.id]);
  await client.preview.close(inline.id);
  await assert.rejects(f.files.describePreview(inline.id), {
    code: "PREVIEW_EXPIRED",
  });
  assert.equal((await f.files.describePreview(dialog.id)).kind, "text");
});

test("native ApplicationHost tools use the same file SDK and path gate through reverse RPC", async (t) => {
  const { spawn } = await import("node:child_process");
  const { createInterface } = await import("node:readline");
  const { fileURLToPath } = await import("node:url");
  const f = await fixture(t);
  const pkg = join(f.root, "native-package");
  await mkdir(pkg);
  const sdk = new URL("../../../../packages/app/sdk/index.js", import.meta.url)
    .href;
  const entry = join(pkg, "index.js");
  await writeFile(
    join(pkg, "package.json"),
    JSON.stringify({
      name: "a",
      version: "1.0.0",
      type: "module",
      mewvis: {
        app: { version: 1, entry: "./index.js" },
        permissions: ["workspace-files"],
      },
    }),
  );
  await writeFile(
    entry,
    `import { defineApplication, defineTool } from ${JSON.stringify(sdk)};
    export default defineApplication({ inject: ["files", "tools"], apply(ctx) {
      ctx.tools.register(defineTool({ name: "save_file", description: "file round trip", risk: "medium", output: { schema: { type: "object" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] }, parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] }, execute: async ({filePath}) => {
        await ctx.files.writeText(filePath, "native file");
        return { text: await ctx.files.readText(filePath), roots: await ctx.files.roots() };
      }}));
    }});`,
  );
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "../../../../packages/app/host/dist/service.mjs",
          import.meta.url,
        ),
      ),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.type === "application-files:request") {
      void f.files
        .request(message.connection, message.request)
        .then(
          (value) => ({ ok: true, value }),
          (error) => ({
            ok: false,
            error: { code: error.code ?? "FILE_ERROR", message: error.message },
          }),
        )
        .then((response) =>
          child.stdin.write(
            JSON.stringify({
              type: "application-files:response",
              id: message.id,
              response,
            }) + "\n",
          ),
        );
      return;
    }
    const call = pending.get(message.id);
    if (call) {
      pending.delete(message.id);
      clearTimeout(call.timer);
      if (message.error) call.reject(new Error(message.error.message));
      else call.resolve(message.result);
    }
  });
  t.after(async () => {
    lines.close();
    child.kill();
  });
  let sequence = 0;
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`native RPC timeout: ${stderr}`));
      }, 10_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  await rpc("configure", {
    settingsPath: join(f.root, "native-settings"),
    applications: [
      {
        kind: "mewvis",
        id: "a",
        name: "a",
        version: "1.0.0",
        source: "builtin",
        description: "",
        entry,
        packageRoot: pkg,
        permissionStatus: "declared",
        permissions: ["workspace-files"],
        fileConnection: f.connections.get("a"),
      },
    ],
  });
  const filePath = join(f.bindings.get("a").path, "native.txt");
  const result = await rpc("execute", {
    applicationId: "a",
    toolName: "save_file",
    arguments: { filePath },
  });
  assert.equal(result.value.text, "native file");
  assert.equal(await readFile(filePath, "utf8"), "native file");
  const outside = join(f.root, "outside-native.txt");
  await assert.rejects(
    rpc("execute", {
      applicationId: "a",
      toolName: "save_file",
      arguments: { filePath: outside },
    }),
    /数据目录或工作区/,
  );
  await assert.rejects(readFile(outside), { code: "ENOENT" });
});

test("replacing an allowed root with a symlink never changes its authority", async (t) => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "mewvis-file-root-")),
  );
  const own = join(root, "own"),
    other = join(root, "other");
  await mkdir(own);
  await mkdir(other);
  await writeFile(join(other, "secret.txt"), "secret");
  const files = new ApplicationFiles(
    async () => ({ dataPath: own, workspacePaths: [], protectedPaths: [] }),
    new EventHub(),
  );
  const connection = await files.connect("app");
  t.after(async () => {
    await files.close();
    await rm(root, { recursive: true, force: true });
  });
  await rename(own, join(root, "old-own"));
  await symlink(other, own, "dir");
  await assert.rejects(
    files.request(connection, {
      version: 1,
      method: "read",
      params: { filePath: join(own, "secret.txt") },
    }),
    (error) => error.code === "PERMISSION_DENIED",
  );
  await assert.rejects(
    files.request(connection, {
      version: 1,
      method: "write.begin",
      params: { filePath: join(other, "new.txt") },
    }),
    (error) => error.code === "PERMISSION_DENIED",
  );
  assert.deepEqual(await readdir(other), ["secret.txt"]);
});

test(
  "non-regular files are rejected before opening so FIFO reads cannot block the service",
  { skip: process.platform === "win32" },
  async (t) => {
    const f = await fixture(t),
      client = f.clients.get("a");
    const fifo = join(f.bindings.get("a").path, "input.pipe");
    execFileSync("mkfifo", [fifo]);
    await assert.rejects(client.readBinary(fifo), { code: "INVALID_FILE" });
    await assert.rejects(client.preview.openDialog({ filePath: fifo }), {
      code: "INVALID_FILE",
    });
  },
);
