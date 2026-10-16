import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { fixture as f, memoryStorage } from "./fixture.mjs";

// Use the actual host compiler: SDK defineTool and the preview fixture do not
// validate the host's supported JSON Schema subset at registration time.
const hostRequire = createRequire(
  new URL("../../../../../packages/app/host/package.json", import.meta.url),
);
const hostSchemas = await import(
  pathToFileURL(hostRequire.resolve("@deepseek-ai/dsh-tools")).href
);

test("tool schemas compile under the host and reject incorrect media verification output", () => {
  for (const tool of f.tools) {
    hostSchemas.assertObjectJsonSchema(tool.parameters);
    hostSchemas.assertSupportedJsonSchema(tool.output.schema);
    const project = f.exampleProject();
    const args = { project, episodeId: project.episodes[0].id };
    const report = tool.execute(args);
    assert.deepEqual(
      hostSchemas.validateJsonSchemaValue(tool.parameters, args),
      [],
    );
    assert.deepEqual(
      hostSchemas.validateJsonSchemaValue(tool.output.schema, report),
      [],
    );
    for (const mediaVerified of [true, "false", null]) {
      assert.ok(
        hostSchemas.validateJsonSchemaValue(tool.output.schema, {
          ...report,
          mediaVerified,
        }).length > 0,
      );
    }
  }
});

test("import validation rejects incompatible formats, duplicate identities, invalid references and durations", () => {
  const mutate = (change, pattern) => {
    const project = f.exampleProject();
    change(project);
    assert.throws(() => f.validateProject(project), pattern);
  };
  mutate((p) => (p.version = 2), /版本/);
  mutate((p) => (p.episodes[0].id = p.id), /重复/);
  mutate(
    (p) =>
      (p.episodes[0].shots[0].sceneId = p.assets.find(
        (a) => a.kind === "character",
      ).id),
    /引用/,
  );
  mutate((p) => (p.episodes[0].shots[0].speakerId = "missing"), /引用/);
  mutate((p) => {
    const id = p.assets.find((a) => a.kind === "character").id;
    p.episodes[0].shots[0].characterIds = [id, id];
  }, /引用/);
  mutate((p) => (p.episodes[0].shots[0].duration = 0), /时长/);
  mutate((p) => (p.episodes[0].shots[0].duration = Infinity), /时长/);
  mutate((p) => (p.episodes = []), /至少/);
  mutate((p) => (p.title = " "), /项目名称/);
  mutate((p) => (p.assets = {}), /素材/);
});

test("large projects require a file-backed workspace; validated records do not alias imported objects", async () => {
  const project = f.exampleProject();
  const validated = f.validateProject(project);
  validated.episodes[0].shots[0].characterIds.push("changed");
  assert.deepEqual(project.episodes[0].shots[0].characterIds, []);
  project.episodes[0].script = "中".repeat(78000);
  f.validateProject(project);
  await assert.rejects(
    f.createRepository(memoryStorage()).save(project),
    /工作目录/,
  );
  assert.throws(
    () => f.checkProjectSize({ script: "中".repeat(6 * 1024 * 1024) }),
    /16 MiB/,
  );
});

test("asset removal clears references in all episodes while retaining authored text", () => {
  const project = f.exampleProject();
  const extra = structuredClone(project.episodes[0]);
  extra.id = f.newId();
  extra.shots.forEach((s) => (s.id = f.newId()));
  project.episodes.push(extra);
  const character = project.assets.find((a) => a.kind === "character");
  const scene = project.assets.find((a) => a.kind === "scene");
  const before = project.episodes.map((e) =>
    e.shots.map((s) => [s.description, s.dialogue]),
  );
  const result = f.removeAsset(f.removeAsset(project, character.id), scene.id);
  assert.deepEqual(
    result.episodes.map((e) => e.shots.map((s) => [s.description, s.dialogue])),
    before,
  );
  for (const episode of result.episodes)
    for (const shot of episode.shots) {
      assert.equal(shot.sceneId, "");
      assert.equal(shot.speakerId, "");
      assert.deepEqual(shot.characterIds, []);
    }
  f.validateProject(result);
  assert.equal(project.assets.length, 2);
});

test("imported copies remap every identity and reference independently", () => {
  const source = f.exampleProject();
  const result = f.copyProject(source);
  const identities = (p) => [
    p.id,
    ...p.assets.map((a) => a.id),
    ...p.episodes.flatMap((e) => [e.id, ...e.shots.map((s) => s.id)]),
  ];
  assert.equal(
    identities(source).filter((id) => identities(result).includes(id)).length,
    0,
  );
  const shot = result.episodes[0].shots.find((s) => s.characterIds.length);
  assert.equal(
    result.assets.find((a) => a.id === shot.sceneId).name,
    source.assets.find((a) => a.kind === "scene").name,
  );
  assert.equal(
    result.assets.find((a) => a.id === shot.characterIds[0]).kind,
    "character",
  );
  result.assets[0].description = "新描述";
  assert.notEqual(result.assets[0].description, source.assets[0].description);
  f.validateProject(result);
});

test("shot order drives manifest and timeline duration, file notes never imply media success", () => {
  const project = f.exampleProject();
  const episode = project.episodes[0];
  const first = episode.shots[0],
    second = episode.shots[1];
  const moved = f.moveShot(episode, second.id, -1);
  assert.equal(moved.shots[0].id, second.id);
  assert.equal(moved.shots[1].id, first.id);
  assert.equal(episode.shots[0].id, first.id);
  assert.equal(f.moveShot(episode, first.id, -1), episode);
  const report = f.deliveryReport(project, moved);
  assert.equal(report.duration, 13);
  assert.equal(report.ready, true);
  assert.equal(report.mediaVerified, false);
  moved.shots.forEach((s) => {
    s.imageReference = "done.png";
    s.videoReference = "done.mp4";
    s.audioReference = "done.wav";
  });
  assert.equal(f.stageStatus(project, moved, "video"), "blocked");
  assert.equal(f.stageStatus(project, moved, "delivery"), "draft");
  const manifest = f.productionManifest(project, moved);
  assert.ok(manifest.indexOf(second.title) < manifest.indexOf(first.title));
  assert.match(manifest, /文件备注未经媒体校验/);
});

test("host tool validates actual input and reports incomplete plans without writing", () => {
  const project = f.createProject("测试", "movie");
  const tool = f.tools[0];
  const report = tool.execute({ project, episodeId: project.episodes[0].id });
  assert.equal(report.ready, false);
  assert.equal(report.issues.length, 2);
  assert.equal(report.mediaVerified, false);
  assert.throws(() => tool.execute({ project, episodeId: "absent" }), /未找到/);
  assert.throws(
    () => tool.execute({ project: { ...project, version: 9 } }),
    /版本/,
  );
});

test("assistant context respects character and escaped JSON byte limits and marks truncated data", () => {
  const project = f.exampleProject();
  const episode = project.episodes[0];
  assert.ok(
    JSON.parse(f.assistantContext(project, episode, "script").requestContext)
      .project,
  );
  for (const character of ["a", "中", "\n", '"']) {
    episode.script = character.repeat(78000);
    const context = f.assistantContext(project, episode, "script");
    assert.ok(context.requestContext.length < 64000);
    assert.ok(Buffer.byteLength(JSON.stringify(context)) < 256 * 1024);
    const value = JSON.parse(context.requestContext);
    assert.equal(value.project, undefined);
    assert.match(value.summary.note, /摘要/);
  }
});

test("repository persists isolated records across instances and snapshots queued writes", async () => {
  const storage = memoryStorage();
  await storage.setItem("film:assistant:keep", { chatId: "keep" });
  const repository = f.createRepository(storage),
    project = f.exampleProject();
  const first = repository.save(project);
  project.title = "后续编辑";
  await first;
  assert.equal((await f.createRepository(storage).list())[0].title, "雨夜电台");
  await repository.save(project);
  assert.equal((await f.createRepository(storage).list())[0].title, "后续编辑");
  await repository.remove(project.id);
  assert.deepEqual(await storage.keys(), ["film:assistant:keep"]);
});

test("failed queued write can be retried; corrupt data stays intact", async () => {
  const storage = memoryStorage();
  let fail = true;
  const repository = f.createRepository({
    ...storage,
    async setItem(key, value) {
      if (fail) {
        fail = false;
        throw new Error("测试写入失败");
      }
      await storage.setItem(key, value);
    },
  });
  const project = f.exampleProject();
  await assert.rejects(repository.save(project), /写入失败/);
  await repository.save(project);
  assert.equal((await repository.list()).length, 1);
  await storage.setItem("film:project:bad", { version: 9 });
  await assert.rejects(repository.list(), /版本/);
  assert.deepEqual(await storage.getItem("film:project:bad"), { version: 9 });
  assert.equal(
    (await storage.getItem(f.projectKey(project.id))).title,
    project.title,
  );
});

test("later snapshots wait for an earlier slow write and win in storage", async () => {
  const storage = memoryStorage();
  let release, entered;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let writes = 0;
  const repository = f.createRepository({
    ...storage,
    async setItem(key, value) {
      writes++;
      if (writes === 1) {
        entered();
        await waiting;
      }
      await storage.setItem(key, value);
    },
  });
  const project = f.exampleProject();
  const first = repository.save(project);
  const second = repository.save({ ...project, title: "最新草稿" });
  await started;
  assert.equal(writes, 1);
  release();
  await Promise.all([first, second]);
  assert.equal((await repository.list())[0].title, "最新草稿");
});

test("resume restores the saved episode, stage and shot without mutating the portable project", async () => {
  const storage = memoryStorage(),
    repository = f.createRepository(storage);
  const project = f.exampleProject();
  await repository.save(project);
  const episode = project.episodes[0];
  const view = {
    episodeId: episode.id,
    step: "dubbing",
    shotId: episode.shots[1].id,
  };
  await repository.saveView(project.id, view);
  assert.deepEqual(await f.createRepository(storage).view(project), view);
  assert.deepEqual((await repository.list())[0], project);
  assert.deepEqual(
    f.resumeView(project, {
      episodeId: "stale",
      step: "invalid",
      shotId: "stale",
    }),
    {
      episodeId: episode.id,
      step: "storyboard",
      shotId: episode.shots.at(-1).id,
    },
  );
  const other = f.createProject("另一个项目", "movie");
  await repository.save(other);
  await repository.saveView(other.id, f.resumeView(other));
  await repository.remove(project.id);
  assert.equal(storage.values.has(`film:view:${project.id}`), false);
  assert.equal(storage.values.has(`film:view:${other.id}`), true);
});
