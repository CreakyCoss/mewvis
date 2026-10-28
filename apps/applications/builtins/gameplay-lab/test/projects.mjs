import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  readFile,
  writeFile,
  mkdtemp,
  mkdir,
  readdir,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createProjectHost } from "./host-fixture.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "gameplay-repository-test-"));
await build({
  stdin: {
    contents:
      'export * from "./main/storage.ts";export * from "./main/fixtures.ts";export * from "./main/engine.ts";export * from "./main/history.ts";export * from "./main/records.ts";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(temp, "domain.mjs"),
  logLevel: "silent",
});
const f = await import(pathToFileURL(join(temp, "domain.mjs")));
after(() => rm(temp, { recursive: true, force: true }));
async function fixture(t) {
  const host = await createProjectHost();
  t.after(() => host.close());
  return { ...host, repo: f.createProjectRepository(host.data, host.files) };
}
const workspace = (project) => ({
  ...f.initialWorkspace(),
  active: project.id,
  projects: [project],
});
const create = (env, name = "测试项目", templateId = "development") =>
  env.repo.create({ name, parent: env.projectsPath, templateId });
async function externalWrite(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
  const future = new Date(Date.now() + 5000);
  await utimes(path, future, future);
}

test("first launch stays empty and only explicit creation copies a template JSON", async (t) => {
  const e = await fixture(t);
  assert.deepEqual((await e.repo.list()).projects, []);
  assert.deepEqual(await readdir(e.projectsPath), []);
  assert.deepEqual(await e.data.storage.keys(), []);
  const sources = await Promise.all(
    ["development", "combination"].map((id) =>
      readFile(join(root, "main/templates", id + ".json"), "utf8"),
    ),
  );
  for (const id of ["development", "combination"]) {
    const p = await create(e, id, id);
    const saved = JSON.parse(await readFile(f.projectFile(p.path), "utf8"));
    assert.deepEqual(saved.fields, f.makeTemplate(id).fields);
    assert.equal(saved.project.templateId, id);
    assert.equal(saved.project.id, p.id);
    assert.equal(
      f.current(f.simulate(p.model, 42, "goal")).outcome.kind,
      "won",
    );
  }
  assert.deepEqual(
    await Promise.all(
      ["development", "combination"].map((id) =>
        readFile(join(root, "main/templates", id + ".json"), "utf8"),
      ),
    ),
    sources,
  );
  const index = await e.data.storage.getItem(f.LIBRARY_KEY);
  assert.equal(index.projects.length, 2);
  assert.equal(JSON.stringify(index).includes('"fields"'), false);
  assert.equal(JSON.stringify(index).includes('"versions"'), false);
});

test("project edits and named versions survive a host restart without modifying another project", async (t) => {
  const e = await createProjectHost();
  t.after(() => rm(e.root, { recursive: true, force: true }));
  const repo = f.createProjectRepository(e.data, e.files);
  const a = await repo.create({
    name: "甲",
    parent: e.projectsPath,
    templateId: "development",
  });
  const b = await repo.create({
    name: "乙",
    parent: e.projectsPath,
    templateId: "combination",
  });
  const untouched = await readFile(f.projectFile(b.path), "utf8");
  a.model.actions[0].costs[0].value = 17;
  a.versions.push({
    id: "version-one",
    name: "版本一",
    model: structuredClone(a.model),
    createdAt: new Date().toISOString(),
  });
  await repo.saveWorkspace(workspace(a));
  await e.close(false);
  const restarted = await createProjectHost(e.root);
  t.after(() => restarted.close());
  const list = await f
    .createProjectRepository(restarted.data, restarted.files)
    .list();
  assert.equal(
    list.projects.find((p) => p.id === a.id).model.actions[0].costs[0].value,
    17,
  );
  assert.equal(list.projects.find((p) => p.id === a.id).versions.length, 1);
  assert.equal(await readFile(f.projectFile(b.path), "utf8"), untouched);
});

test("existing directories are never overwritten during project creation", async (t) => {
  const e = await fixture(t);
  const directory = join(e.projectsPath, "已有项目");
  await mkdir(directory);
  await writeFile(join(directory, "keep.txt"), "keep");
  await assert.rejects(create(e, "已有项目"), /存在|exist/i);
  assert.equal(await readFile(join(directory, "keep.txt"), "utf8"), "keep");
  assert.deepEqual((await e.repo.list()).projects, []);
});

test("switch and reset back up the user's JSON and preserve project identity and versions", async (t) => {
  const e = await fixture(t),
    p = await create(e);
  p.model.actions[0].costs[0].value = 27;
  p.versions.push({
    id: "saved-design",
    name: "旧设计",
    model: structuredClone(p.model),
    createdAt: new Date().toISOString(),
  });
  const oldRun = f.startRun(p.model);
  const switched = await e.repo.reset(p, "combination");
  const backup = JSON.parse(await readFile(switched.backup, "utf8"));
  assert.equal(backup.actions[0].costs[0].value, 27);
  assert.equal(backup.project.templateId, "development");
  assert.equal(switched.project.id, p.id);
  assert.equal(switched.project.model.name, p.model.name);
  assert.equal(switched.project.versions.length, 1);
  assert.equal(switched.project.templateId, "combination");
  assert.equal(oldRun.model.actions[0].costs[0].value, 27);
  switched.project.model.fields[0].initial = 99;
  const reset = await e.repo.reset(switched.project, "combination");
  assert.equal(reset.project.model.fields[0].initial, 4);
  assert.equal(
    JSON.parse(await readFile(reset.backup, "utf8")).fields[0].initial,
    99,
  );
  assert.equal((await readdir(join(p.path, "backups"))).length, 2);
});

test("external JSON changes block stale saves and resets until explicit reload", async (t) => {
  const e = await fixture(t),
    p = await create(e),
    path = f.projectFile(p.path);
  const disk = JSON.parse(await readFile(path, "utf8"));
  disk.fields[0].initial = 77;
  await externalWrite(path, disk);
  p.model.fields[0].initial = 66;
  await assert.rejects(
    e.repo.saveWorkspace(workspace(p)),
    (error) => error.code === "FILE_CHANGED",
  );
  assert.equal(JSON.parse(await readFile(path, "utf8")).fields[0].initial, 77);
  await assert.rejects(
    e.repo.reset(p, "combination"),
    (error) => error.code === "FILE_CHANGED",
  );
  const restored = await e.repo.reload(p);
  assert.equal(restored.model.fields[0].initial, 77);
  restored.model.fields[0].initial = 88;
  await e.repo.saveWorkspace(workspace(restored));
  assert.equal(JSON.parse(await readFile(path, "utf8")).fields[0].initial, 88);
});

test("unchanged UI state cannot bypass external-change checks during reset", async (t) => {
  const e = await fixture(t),
    p = await create(e),
    path = f.projectFile(p.path);
  const disk = JSON.parse(await readFile(path, "utf8"));
  disk.fields[0].initial = 101;
  await externalWrite(path, disk);
  await assert.rejects(e.repo.reset(p, "combination"), /外部修改/);
  p.model.fields[0].initial = 66;
  await assert.rejects(e.repo.saveWorkspace(workspace(p)), /重新打开/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).fields[0].initial, 101);
});

test("unreadable projects keep their index and do not block healthy projects", async (t) => {
  const e = await fixture(t),
    p = await create(e, "损坏项目");
  await writeFile(f.projectFile(p.path), "{broken");
  const list = await f.createProjectRepository(e.data, e.files).list();
  assert.equal(list.errors.length, 1);
  assert.equal(list.projects.length, 0);
  await create(e, "正常项目");
  assert.equal(
    (await e.data.storage.getItem(f.LIBRARY_KEY)).projects.length,
    2,
  );
  assert.equal(await readFile(f.projectFile(p.path), "utf8"), "{broken");
});

test("obsolete database projects are deleted without changing directory projects or their index", async (t) => {
  const e = await fixture(t),
    project = await create(e, "目录项目");
  const path = f.projectFile(project.path);
  const before = await readFile(path, "utf8");
  const index = await e.data.storage.getItem(f.LIBRARY_KEY);
  await e.data.storage.setItem(f.OBSOLETE_WORKSPACE_KEY, {
    format: "gameplay-workspace-v1",
    projects: [{ id: "old-project", model: f.makeTemplate(), versions: [] }],
  });
  const list = await e.repo.list();
  assert.equal(await e.data.storage.getItem(f.OBSOLETE_WORKSPACE_KEY), null);
  assert.equal(list.projects.length, 1);
  assert.equal(list.projects[0].id, project.id);
  assert.deepEqual(list.errors, []);
  assert.equal(await readFile(path, "utf8"), before);
  assert.deepEqual(await e.data.storage.getItem(f.LIBRARY_KEY), index);
  await e.data.storage.setItem(f.OBSOLETE_WORKSPACE_KEY, "invalid old data");
  assert.deepEqual((await e.repo.list()).errors, []);
  assert.equal(await e.data.storage.getItem(f.OBSOLETE_WORKSPACE_KEY), null);
});

test("cancelled pickers create no projects and failed initialization cleans up only the new directory", async (t) => {
  const e = await fixture(t);
  e.chooseDirectory(null);
  assert.equal(await e.repo.selectDirectory(), null);
  assert.equal(await e.repo.open(), null);
  assert.deepEqual(await readdir(e.projectsPath), []);
  const failed = f.createProjectRepository(e.data, {
    ...e.files,
    async writeText() {
      throw new Error("injected write failure");
    },
  });
  await assert.rejects(
    failed.create({
      name: "未完成项目",
      parent: e.projectsPath,
      templateId: "development",
    }),
    /write failure/,
  );
  assert.deepEqual(await readdir(e.projectsPath), []);
  assert.deepEqual(await e.data.storage.keys(), []);
});

test("a failed reload of a replaced project cannot authorize stale UI writes", async (t) => {
  const e = await fixture(t),
    p = await create(e),
    path = f.projectFile(p.path);
  const disk = JSON.parse(await readFile(path, "utf8"));
  disk.project.id = "replacement-project";
  disk.fields[0].initial = 203;
  await externalWrite(path, disk);
  await assert.rejects(e.repo.reload(p), /标识/);
  p.model.fields[0].initial = 66;
  await assert.rejects(e.repo.saveWorkspace(workspace(p)), /标识/);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), disk);
});

test("project paths handle Unix, Windows drive roots and invalid names", () => {
  assert.equal(f.projectDirectory("/", "策略项目"), "/策略项目");
  assert.equal(f.projectDirectory("C:\\", "策略项目"), "C:/策略项目");
  assert.equal(
    f.projectDirectory("C:\\Games\\", "规则/草稿"),
    "C:/Games/规则-草稿",
  );
  assert.throws(() => f.projectDirectory("relative/path", "项目"), /绝对路径/);
  assert.throws(() => f.projectDirectory("/projects", "..."), /文件夹名称/);
});

test("run and experiment files survive a host restart, keep frozen rules, and resume remaining samples", async (t) => {
  const host = await createProjectHost();
  t.after(() => rm(host.root, { recursive: true, force: true }));
  const repo = f.createProjectRepository(host.data, host.files),
    history = f.createHistoryRepository(host.data, host.files);
  const p = await repo.create({
    name: "持久记录",
    parent: host.projectsPath,
    templateId: "combination",
  });
  const trial = f.newTrial(p.id, p.model, 51, 2);
  for (let i = 0; i < 3; i++) {
    trial.run = f.step(trial.run, f.choose(trial.run, "goal"));
    trial.drivers.push("goal");
  }
  await history.save(p, trial);
  const e = f.newExperiment(p.id, p.model, 71, 1, "growth");
  e.count = 2;
  e.samples.push(f.nextSample(e));
  await history.save(p, e);
  const trialFile = join(p.path, "runs", trial.id + ".json"),
    experimentFile = join(p.path, "experiments", e.id + ".json");
  const document = JSON.parse(await readFile(trialFile, "utf8"));
  assert.equal(document.format, "gameplay-run-v1");
  assert.equal(document.log.choices.length, 3);
  assert.equal(document.log.events[1].state, undefined);
  const originalModel = structuredClone(p.model);
  await repo.reset(p, "development");
  await host.close(false);
  const restarted = await createProjectHost(host.root);
  t.after(() => restarted.close());
  const project = (
    await f.createProjectRepository(restarted.data, restarted.files).list()
  ).projects[0];
  const history2 = f.createHistoryRepository(restarted.data, restarted.files),
    restored = await history2.list(project);
  assert.deepEqual(restored.errors, []);
  assert.deepEqual(restored.trials[0], trial);
  assert.deepEqual(restored.trials[0].run.model, originalModel);
  assert.notDeepEqual(project.model, originalModel);
  const resumed = restored.experiments[0];
  assert.equal(resumed.status, "interrupted");
  assert.equal(resumed.samples.length, 1);
  while (resumed.samples.length < 4) {
    resumed.samples.push(f.nextSample(resumed));
    await history2.save(project, resumed);
  }
  resumed.status = "completed";
  await history2.save(project, resumed);
  assert.equal((await history2.list(project)).experiments[0].samples.length, 4);
  assert.equal(
    new Set(resumed.samples.map((s) => `${s.policy}:${s.index}`)).size,
    4,
  );
  assert.equal(
    JSON.parse(await readFile(experimentFile, "utf8")).status,
    "completed",
  );
  const next = {
    ...trial,
    run: f.step(trial.run, f.choose(trial.run, "random")),
    drivers: [...trial.drivers, "random"],
  };
  await history2.save(project, next);
  assert.deepEqual((await history2.list(project)).trials[0], next);
});

test("history protects externally edited files and isolates corrupted records", async (t) => {
  const env = await fixture(t),
    p = await create(env, "记录保护"),
    history = f.createHistoryRepository(env.data, env.files);
  const trial = f.newTrial(p.id, p.model, 42, 1);
  await history.save(p, trial);
  const path = join(p.path, "runs", trial.id + ".json"),
    external = JSON.parse(await readFile(path, "utf8"));
  external.updatedAt = "2026-10-01T00:00:00.000Z";
  await externalWrite(path, external);
  const next = {
    ...trial,
    run: f.step(trial.run, { action: "study" }),
    drivers: ["manual"],
  };
  await assert.rejects(history.save(p, next), /外部修改/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).log.choices.length, 0);
  // Explicitly reloading authorizes continued editing of a valid external record.
  assert.equal((await history.list(p)).trials.length, 1);
  await history.save(p, next);
  const broken = join(p.path, "runs", "broken.json");
  await writeFile(broken, "{broken");
  const loaded = await history.list(p);
  assert.equal(loaded.trials.length, 1);
  assert.equal(loaded.errors.length, 1);
  assert.equal(await readFile(broken, "utf8"), "{broken");
  const rogue = f.newTrial(p.id, p.model, 2, 1);
  await writeFile(join(p.path, "runs", rogue.id + ".json"), "keep");
  await assert.rejects(history.save(p, rogue), /存在|exist/i);
  const other = await create(env, "其他项目");
  await assert.rejects(history.save(other, next), /不匹配/);
});
