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
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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
import { setup, token } from "../support/helpers.mjs";

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
  };
}
const denied = (promise) =>
  assert.rejects(promise, (error) => error.code === "PERMISSION_DENIED");

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
