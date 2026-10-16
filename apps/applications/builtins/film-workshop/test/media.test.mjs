import assert from "node:assert/strict";
import test from "node:test";
import { File } from "node:buffer";
import { fixture as f, memoryStorage } from "./fixture.mjs";

function services(root = "/projects") {
  const contents = new Map(),
    chunks = [],
    aborted = [];
  const workspace = { id: "workspace-film", name: "影视", path: root };
  let cancel = false;
  return {
    contents,
    chunks,
    aborted,
    workspace,
    cancel: () => {
      cancel = true;
    },
    workspaces: {
      async create() {
        return cancel ? null : workspace;
      },
      async get() {
        return workspace;
      },
    },
    files: {
      async mkdir() {},
      async writeText(path, text) {
        contents.set(path, text);
      },
      async readText(path) {
        if (!contents.has(path)) throw new Error("项目文件不存在");
        return contents.get(path);
      },
      async beginWrite(path) {
        return path;
      },
      async writeChunk(id, offset, bytes) {
        chunks.push({ id, offset, bytes: bytes.slice() });
      },
      async commitWrite(id) {
        contents.set(
          id,
          Buffer.concat(chunks.filter((c) => c.id === id).map((c) => c.bytes)),
        );
      },
      async abortWrite(id) {
        aborted.push(id);
      },
    },
  };
}
async function projectWithWorkspace() {
  const host = services(),
    storage = memoryStorage(),
    repository = f.createRepository(storage, host);
  return {
    host,
    storage,
    repository,
    project: await repository.attach(f.exampleProject()),
  };
}
function image(project, suffix = "one") {
  return {
    id: f.newId(),
    path: `generated/request/${suffix}.png`,
    name: `${suffix}.png`,
    kind: "image",
    size: 16,
    mimeType: "image/png",
    source: "generated",
    createdAt: Date.now(),
  };
}
function job(project) {
  return {
    id: f.newId(),
    episodeId: project.episodes[0].id,
    shotId: project.episodes[0].shots[0].id,
    workspaceId: project.workspace.id,
    chatId: "chat-film",
    taskId: "task-film",
    status: "running",
    prompt: "海边",
    outputIds: [],
    createdAt: Date.now(),
  };
}
function message(role, blocks) {
  return { role, blocks };
}
function user(id) {
  return message("user", [{ type: "text", content: f.generationMarker(id) }]);
}
function output(path) {
  return { type: "image", filePath: path, mimeType: "image/png" };
}
function result(path, status = "completed") {
  return message("assistant", [
    {
      type: "tool",
      name: "generate_media",
      media: {
        purpose: "image-generation",
        status,
        outputs: path ? [output(path)] : [],
        ...(status === "failed" ? { error: "供应商失败" } : {}),
      },
    },
  ]);
}

test("workspace projects persist large JSON on disk with only a small storage index", async () => {
  const { project, host, storage, repository } = await projectWithWorkspace();
  project.episodes[0].script = "中".repeat(78000);
  await repository.save(project);
  const index = await storage.getItem(f.projectKey(project.id));
  assert.deepEqual(index, {
    format: "mewvis-film-project-index",
    id: project.id,
    workspaceId: host.workspace.id,
  });
  assert.ok(
    Buffer.byteLength(
      host.contents.get(`${project.workspace.directory}/project.json`),
    ) >
      220 * 1024,
  );
  assert.deepEqual(await f.createRepository(storage, host).list(), [project]);
  await repository.remove(project.id);
  assert.equal(
    host.contents.size,
    1,
    "removing a library record retains project files",
  );
  assert.equal(storage.values.size, 0);
});

test("cancelled directory selection leaves storage untouched; replaced workspaces and corrupt indexes are rejected", async () => {
  const { project, host, storage, repository } = await projectWithWorkspace();
  host.cancel();
  assert.equal(await repository.attach(f.exampleProject()), null);
  assert.equal(storage.values.size, 0);
  await repository.save(project);
  host.workspace.path = "/another";
  await assert.rejects(repository.save(project), /工作目录已变化/);
  host.workspace.path = "/projects";
  const path = `${project.workspace.directory}/project.json`;
  host.contents.set(
    path,
    JSON.stringify({
      ...project,
      workspace: { ...project.workspace, id: "different" },
    }),
  );
  await assert.rejects(repository.list(), /不一致/);
  assert.equal(
    storage.values.size,
    1,
    "unreadable records are not silently removed",
  );
});

test("workspace paths normalize Windows separators and support filesystem roots", async () => {
  for (const root of ["C:\\Projects\\Film\\", "C:\\", "/"]) {
    const host = services(root),
      repository = f.createRepository(memoryStorage(), host);
    const project = await repository.attach(f.exampleProject());
    assert.equal(project.workspace.directory.includes("\\"), false);
    await repository.save(project);
    assert.deepEqual(await repository.list(), [project]);
    assert.equal(
      f.relativeMediaPath(
        project,
        `${project.workspace.directory}/generated/a.png`.replaceAll("/", "\\"),
      ),
      "generated/a.png",
    );
  }
});

test("imports stream binary files in ordered chunks and abort partial failures", async () => {
  const { project, host } = await projectWithWorkspace();
  const bytes = new Uint8Array(150000).fill(127);
  const file = new File([bytes], "reference.PNG", { type: "image/png" });
  const imported = await f.importMedia(project, file, host.files);
  assert.deepEqual(
    host.chunks.map((c) => [c.offset, c.bytes.length]),
    [
      [0, 65536],
      [65536, 65536],
      [131072, 18928],
    ],
  );
  assert.deepEqual(
    host.contents.get(f.mediaPath(project, imported)),
    Buffer.from(bytes),
  );
  assert.equal(imported.kind, "image");
  assert.match(imported.path, /^media\/[^/]+\.png$/);
  await assert.rejects(
    f.importMedia(project, new File([], "empty.png"), host.files),
    /空文件/,
  );
  await assert.rejects(
    f.importMedia(project, new File(["bad"], "app.exe"), host.files),
    /请选择/,
  );
  await assert.rejects(
    f.importMedia(project, file, {
      ...host.files,
      async writeChunk() {
        throw new Error("磁盘已满");
      },
    }),
    /磁盘已满/,
  );
  assert.equal(host.aborted.length, 1);
});

test("media paths cannot escape the project or reference a sibling project", async () => {
  const { project } = await projectWithWorkspace();
  for (const path of [
    "/other/a.png",
    `${project.workspace.directory}-other/a.png`,
    `${project.workspace.directory}/../a.png`,
    `${project.workspace.directory}/media/./a.png`,
  ])
    assert.throws(() => f.relativeMediaPath(project, path), /路径|目录/);
  const media = image(project);
  project.media = [media];
  project.episodes[0].shots[0].mediaIds = [media.id];
  project.episodes[0].shots[0].imageMediaId = media.id;
  f.validateProject(project);
  const copy = f.copyProject(project);
  assert.equal(copy.workspace, undefined);
  assert.equal(copy.media, undefined);
  assert.equal(copy.episodes[0].shots[0].imageMediaId, undefined);
  media.path = "../../other.png";
  assert.throws(() => f.validateProject(project), /路径/);
});

test("generation results belong to the marked user turn and do not mix other turns", async () => {
  const { project } = await projectWithWorkspace();
  const record = job(project);
  const messages = [
    user("other"),
    result("/previous.png"),
    user(record.id),
    result("/correct.png"),
    user("later"),
    result("/later.png"),
  ];
  const resolved = f.generationResult(record, { messages });
  assert.deepEqual(resolved.outputs, [output("/correct.png")]);
  assert.equal(resolved.status, "completed");
  assert.equal(f.generationResult(record, { messages: [user("other")] }), null);
  const running = f.generationResult(
    { ...record, taskId: undefined },
    {
      messages: [user(record.id)],
      execution: { taskId: "previous", state: "completed" },
    },
  );
  assert.equal(
    running.status,
    "running",
    "stale terminal execution must not finish a preparing request",
  );
  const failed = f.generationResult(record, {
    messages: [user(record.id), result("/partial.png", "failed")],
    execution: { taskId: record.taskId, state: "failed" },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.outputs.length, 1);
  assert.equal(failed.error, "供应商失败");
  const stopped = f.generationResult(record, {
    messages: [user(record.id)],
    execution: { taskId: record.taskId, state: "cancelled" },
  });
  assert.equal(stopped.status, "stopped");
});

test("writeback pins the submitted shot, deduplicates files and preserves a manual image choice", async () => {
  const { project } = await projectWithWorkspace();
  const record = job(project),
    generated = image(project);
  project.generations = [record];
  const applied = f.applyGeneration(project, record.id, "completed", [
    generated,
  ]);
  assert.equal(applied.episodes[0].shots[0].imageMediaId, generated.id);
  assert.equal(applied.episodes[0].shots[1].imageMediaId, undefined);
  assert.equal(
    f.applyGeneration(applied, record.id, "completed", [generated]),
    applied,
  );
  assert.equal(project.media, undefined);
  const manual = image(project, "manual");
  project.media = [manual];
  project.episodes[0].shots[0].mediaIds = [manual.id];
  project.episodes[0].shots[0].imageMediaId = manual.id;
  const preserved = f.applyGeneration(project, record.id, "completed", [
    generated,
  ]);
  assert.equal(preserved.episodes[0].shots[0].imageMediaId, manual.id);
  assert.deepEqual(preserved.episodes[0].shots[0].mediaIds, [
    manual.id,
    generated.id,
  ]);
  record.previousMediaId = manual.id;
  delete project.episodes[0].shots[0].imageMediaId;
  assert.equal(
    f.applyGeneration(project, record.id, "completed", [generated]).episodes[0]
      .shots[0].imageMediaId,
    undefined,
  );
  project.episodes[0].shots.shift();
  const deletedTarget = f.applyGeneration(project, record.id, "completed", [
    generated,
  ]);
  assert.equal(deletedTarget.media.length, 2);
  assert.equal(deletedTarget.episodes[0].shots[0].imageMediaId, undefined);
  f.validateProject(deletedTarget);
});
