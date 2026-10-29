import test from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import { createProjectHost } from "./host-fixture.mjs";
import { f, root } from "./helpers/domain.mjs";
async function fixture(t) {
  const host = await createProjectHost();
  t.after(() => host.close());
  return { ...host, repo: f.createProjectRepository(host.data, host.files) };
}
const create = (env, name = "测试项目", exampleId = "development") =>
  env.repo.create({ name, parent: env.projectsPath, exampleId });
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
      readFile(join(root, "main/app/projects/templates", id + ".json"), "utf8"),
    ),
  );
  for (const id of ["development", "combination"]) {
    const p = await create(e, id, id);
    const saved = JSON.parse(await readFile(f.projectFile(p.path), "utf8"));
    assert.deepEqual(saved.fields, f.makeTemplate(id).fields);
    assert.equal(saved.project.exampleId, id);
    assert.equal(saved.project.id, p.id);
    assert.equal(
      f.current(f.simulate(p.model, 42, "goal")).outcome.kind,
      "won",
    );
  }
  assert.deepEqual(
    await Promise.all(
      ["development", "combination"].map((id) =>
        readFile(
          join(root, "main/app/projects/templates", id + ".json"),
          "utf8",
        ),
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
    exampleId: "development",
  });
  const b = await repo.create({
    name: "乙",
    parent: e.projectsPath,
    exampleId: "combination",
  });
  const untouched = await readFile(f.projectFile(b.path), "utf8");
  a.model.actions[0].costs[0].value = 17;
  a.versions.push({
    id: "version-one",
    gameType: a.gameType,
    direction: a.direction,
    brief: structuredClone(a.brief),
    simulator: structuredClone(a.simulator),
    name: "版本一",
    model: structuredClone(a.model),
    createdAt: new Date().toISOString(),
  });
  await repo.saveProject(a);
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
    gameType: p.gameType,
    direction: p.direction,
    brief: structuredClone(p.brief),
    simulator: structuredClone(p.simulator),
    name: "旧设计",
    model: structuredClone(p.model),
    createdAt: new Date().toISOString(),
  });
  const oldRun = f.startRun(p.model);
  const switched = await e.repo.reset(p, "combination");
  const backup = JSON.parse(await readFile(switched.backup, "utf8"));
  assert.equal(backup.actions[0].costs[0].value, 27);
  assert.equal(backup.project.exampleId, "development");
  assert.equal(switched.project.id, p.id);
  assert.equal(switched.project.model.name, p.model.name);
  assert.equal(switched.project.versions.length, 1);
  assert.equal(switched.project.exampleId, "combination");
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
    e.repo.saveProject(p),
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
  await e.repo.saveProject(restored);
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
  await assert.rejects(e.repo.saveProject(p), /重新打开/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).fields[0].initial, 101);
});

test("unreadable projects keep their index and do not block healthy projects", async (t) => {
  const e = await fixture(t),
    p = await create(e, "损坏项目");
  await writeFile(f.projectFile(p.path), "{broken");
  const list = await f.createProjectRepository(e.data, e.files).list();
  assert.equal(list.incompatible.length, 1);
  assert.equal(list.projects.length, 0);
  await create(e, "正常项目");
  assert.equal(
    (await e.data.storage.getItem(f.LIBRARY_KEY)).projects.length,
    2,
  );
  assert.equal(await readFile(f.projectFile(p.path), "utf8"), "{broken");
});

test("incompatible database data remains until explicitly deleted and changed data requires reconfirmation", async (t) => {
  const e = await fixture(t),
    project = await create(e, "目录项目"),
    path = f.projectFile(project.path),
    before = await readFile(path, "utf8"),
    index = await e.data.storage.getItem(f.LIBRARY_KEY);
  const old = {
    format: "gameplay-workspace-v1",
    projects: [{ id: "old-project", model: f.makeTemplate(), versions: [] }],
  };
  await e.data.storage.setItem(f.OBSOLETE_WORKSPACE_KEY, old);
  const list = await e.repo.list();
  assert.equal(list.incompatible.length, 1);
  assert.equal(list.projects[0].id, project.id);
  assert.deepEqual(await e.data.storage.getItem(f.OBSOLETE_WORKSPACE_KEY), old);
  await e.repo.list();
  assert.deepEqual(await e.data.storage.getItem(f.OBSOLETE_WORKSPACE_KEY), old);
  await e.data.storage.setItem(f.OBSOLETE_WORKSPACE_KEY, "changed data");
  await assert.rejects(
    e.repo.deleteIncompatible(list.incompatible[0].id),
    /已变化/,
  );
  assert.equal(
    await e.data.storage.getItem(f.OBSOLETE_WORKSPACE_KEY),
    "changed data",
  );
  const reloaded = await e.repo.list();
  await e.repo.deleteIncompatible(reloaded.incompatible[0].id);
  assert.equal(await e.data.storage.getItem(f.OBSOLETE_WORKSPACE_KEY), null);
  assert.equal(await readFile(path, "utf8"), before);
  assert.deepEqual(await e.data.storage.getItem(f.LIBRARY_KEY), index);
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
      exampleId: "development",
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
  await assert.rejects(e.repo.saveProject(p), /标识/);
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
    exampleId: "combination",
  });
  const cardModel = f.makeTemplate("combination");
  const trial = f.newTrial(p.id, cardModel, 51, 2);
  for (let i = 0; i < 3; i++) {
    trial.run = f.step(trial.run, f.choose(trial.run, "goal"));
    trial.drivers.push("goal");
  }
  await history.save(p, trial);
  const e = f.newExperiment(p.id, cardModel, 71, 1, "growth");
  e.count = 2;
  e.setup.scenario.seedCount = 2;
  e.samples.push(f.nextSample(e));
  await history.save(p, e);
  const trialFile = join(p.path, "runs", trial.id + ".json"),
    experimentFile = join(p.path, "experiments", e.id + ".json");
  const document = JSON.parse(await readFile(trialFile, "utf8"));
  assert.equal(document.format, "gameplay-run-v3");
  assert.equal(document.log.choices.length, 3);
  assert.equal(document.log.events[1].state, undefined);
  const originalModel = structuredClone(cardModel);
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

test("playtest settings and configured histories survive restart and template changes without rewriting snapshots", async (t) => {
  const host = await createProjectHost();
  t.after(() => rm(host.root, { recursive: true, force: true }));
  const repo = f.createProjectRepository(host.data, host.files),
    settings = f.createPlaytestRepository(host.data, host.files),
    history = f.createHistoryRepository(host.data, host.files);
  const p = await repo.create({
      name: "场景与策略",
      exampleId: "development",
      parent: host.projectsPath,
    }),
    config = await settings.load(p);
  const s = config.scenarios[0];
  s.name = "资源不对称";
  s.seedCount = 2;
  s.participants.push(f.initialPlayer(1));
  s.participants[0].values.materials = 70;
  s.participants[1].values.materials = 20;
  const strategy = {
    ...structuredClone(f.builtinStrategies[0]),
    id: "strategy-dev",
    name: "自定义发展",
    rules: [
      {
        action: "build",
        priority: 30,
        conditions: [{ field: "production", op: "lt", value: 6 }],
      },
      { action: "study", priority: 10, conditions: [] },
    ],
  };
  config.strategies.push(strategy);
  s.participants[0].strategyId = strategy.id;
  config.comparedStrategies = [strategy.id, "goal"];
  await settings.save(p, config);
  const file = join(p.path, f.PLAYTEST_FILE),
    saved = await readFile(file, "utf8");
  assert.equal(JSON.parse(saved).format, "gameplay-playtest-v1");
  assert.deepEqual(await host.data.storage.keys(), [f.LIBRARY_KEY]);
  const trial = f.newTrial(
    p.id,
    p.model,
    s.seedStart,
    2,
    f.selectedSetup(config, p.model),
  );
  for (let i = 0; i < 3; i++) {
    const d = f.trialChoice(trial);
    trial.run = f.step(trial.run, d.choice);
    trial.drivers.push(d.driver);
  }
  assert.deepEqual(trial.drivers, [strategy.id, strategy.id, "random"]);
  await history.save(p, trial);
  const experiment = f.newConfiguredExperiment(
    p.id,
    p.model,
    f.selectedSetup(config, p.model, true),
  );
  experiment.samples.push(f.nextSample(experiment));
  await history.save(p, experiment);
  const next = await repo.reset(p, "combination");
  assert.equal(await readFile(file, "utf8"), saved);
  await host.close(false);
  const restarted = await createProjectHost(host.root);
  t.after(() => restarted.close());
  const project = (
      await f.createProjectRepository(restarted.data, restarted.files).list()
    ).projects[0],
    loaded = await f
      .createPlaytestRepository(restarted.data, restarted.files)
      .load(project);
  assert.deepEqual(loaded, config);
  assert.equal(project.id, next.project.id);
  assert.throws(() => f.selectedSetup(loaded, project.model), /无效|初始状态/);
  const h2 = f.createHistoryRepository(restarted.data, restarted.files),
    records = await h2.list(project);
  assert.deepEqual(records.errors, []);
  assert.deepEqual(records.trials[0], trial);
  const resumed = records.experiments[0];
  assert.equal(resumed.status, "interrupted");
  while (resumed.samples.length < 4) {
    resumed.samples.push(f.nextSample(resumed));
    await h2.save(project, resumed);
  }
  resumed.status = "completed";
  await h2.save(project, resumed);
  const final = (await h2.list(project)).experiments[0];
  assert.equal(final.samples.length, 4);
  assert.deepEqual(final.setup, experiment.setup);
  assert.notDeepEqual(final.model, project.model);
});
test("configuration writes protect external edits, exclusive creation and corrupt reloads", async (t) => {
  const env = await fixture(t),
    p = await create(env, "配置保护"),
    settings = f.createPlaytestRepository(env.data, env.files),
    config = await settings.load(p),
    file = join(p.path, f.PLAYTEST_FILE);
  await settings.save(p, config);
  const external = structuredClone(config);
  external.scenarios[0].name = "外部版本";
  await externalWrite(file, external);
  config.scenarios[0].name = "页面版本";
  await assert.rejects(settings.save(p, config), /外部修改/);
  assert.deepEqual(await settings.load(p), external);
  await settings.save(p, config);
  await writeFile(file, "{broken");
  await assert.rejects(settings.load(p));
  await assert.rejects(settings.save(p, config), /重新加载/);
  assert.equal(await readFile(file, "utf8"), "{broken");
  const other = await create(env, "新配置"),
    fresh = await settings.load(other),
    otherFile = join(other.path, f.PLAYTEST_FILE);
  await env.files.mkdir(join(other.path, "configs"));
  await writeFile(otherFile, JSON.stringify(fresh));
  await assert.rejects(settings.save(other, fresh), /存在|exist/i);
  await settings.load(other);
  await settings.save(other, fresh);
  const document = JSON.parse(
    await readFile(f.projectFile(other.path), "utf8"),
  );
  document.project.id = "project-replaced";
  await externalWrite(f.projectFile(other.path), document);
  fresh.scenarios[0].name = "stale";
  await assert.rejects(settings.save(other, fresh), /标识/);
});

test("version and parameter comparisons persist, resume and replay their own rule variants after restart", async (t) => {
  const host = await createProjectHost();
  t.after(() => rm(host.root, { recursive: true, force: true }));
  const repo = f.createProjectRepository(host.data, host.files),
    history = f.createHistoryRepository(host.data, host.files),
    settings = f.createPlaytestRepository(host.data, host.files);
  const project = await repo.create({
      name: "规则对照",
      exampleId: "development",
      parent: host.projectsPath,
    }),
    config = await settings.load(project);
  config.scenarios[0].seedCount = 2;
  config.comparedStrategies = ["goal"];
  await settings.save(project, config);
  project.versions.push({
    id: "version-baseline",
    gameType: project.gameType,
    direction: project.direction,
    brief: structuredClone(project.brief),
    simulator: structuredClone(project.simulator),
    name: "研究成本 8",
    model: structuredClone(project.model),
    createdAt: new Date().toISOString(),
  });
  project.model.actions[1].costs[0].value = 16;
  await repo.saveProject(project);
  const core = await readFile(f.projectFile(project.path), "utf8"),
    settingsText = await readFile(join(project.path, f.PLAYTEST_FILE), "utf8");
  const versions = f.prepareComparison(project, config, {
    mode: "versions",
    baseline: "version-baseline",
    candidate: "draft",
  });
  const scan = f.prepareComparison(project, config, {
    mode: "parameter",
    baseline: "version-baseline",
    scan: {
      parameter: { kind: "cost", action: "study", index: 0 },
      from: 4,
      to: 12,
      step: 4,
    },
  });
  for (const e of [versions, scan]) {
    e.samples.push(f.nextSample(e));
    e.samples.push(f.nextSample(e));
    await history.save(project, e);
  }
  assert.equal(await readFile(f.projectFile(project.path), "utf8"), core);
  assert.equal(
    await readFile(join(project.path, f.PLAYTEST_FILE), "utf8"),
    settingsText,
  );
  const replaced = await repo.reset(project, "combination");
  await host.close(false);
  const restarted = await createProjectHost(host.root);
  t.after(() => restarted.close());
  const reopened = (
    await f.createProjectRepository(restarted.data, restarted.files).list()
  ).projects[0];
  assert.equal(reopened.id, replaced.project.id);
  const h2 = f.createHistoryRepository(restarted.data, restarted.files),
    loaded = await h2.list(reopened);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.experiments.length, 2);
  for (const e of loaded.experiments) {
    assert.equal(e.status, "interrupted");
    let sample;
    while ((sample = f.nextSample(e))) {
      e.samples.push(sample);
      await h2.save(reopened, e);
    }
    e.status = "completed";
    await h2.save(reopened, e);
    assert.equal(e.samples.length, f.experimentTotal(e));
    assert.equal(
      new Set(e.samples.map((s) => `${s.variant}:${s.policy}:${s.seed}`)).size,
      e.samples.length,
    );
    for (const s of e.samples)
      assert.deepEqual(
        f.runLog(
          f.restoreLog(
            f.sampleModel(e, s),
            s.seed,
            e.players,
            s.log,
            f.initialOf(e.setup.scenario),
          ),
        ),
        s.log,
      );
    assert.ok(
      f.pairedDifference(e, e.comparison.variants[1].id, "goal").count === 2,
    );
    assert.notDeepEqual(f.sampleModel(e, e.samples[0]), reopened.model);
  }
  const final = await h2.list(reopened);
  assert.equal(
    final.experiments.filter((e) => e.status === "completed").length,
    2,
  );
  assert.equal(
    await readFile(join(reopened.path, f.PLAYTEST_FILE), "utf8"),
    settingsText,
  );
});

test("blank project creation writes no example content and unfinished drafts reopen normally", async (t) => {
  const env = await fixture(t),
    project = await env.repo.create({
      name: "空白策划",
      parent: env.projectsPath,
      source: "blank",
    });
  assert.equal(project.exampleId, null);
  assert.equal(project.simulator, null);
  for (const key of [
    "fields",
    "capabilities",
    "actions",
    "goals",
    "collections",
  ])
    assert.deepEqual(project.model[key], []);
  project.brief = { coreLoop: "尝试自己的循环", question: "最短几步结束？" };
  project.model.description = "自己定义目标";
  await env.repo.saveProject(project);
  const document = JSON.parse(
    await readFile(f.projectFile(project.path), "utf8"),
  );
  assert.equal(document.project.format, "gameplay-project-v4");
  assert.equal(document.project.exampleId, null);
  assert.equal(document.project.templateId, undefined);
  const listed = await env.repo.list();
  assert.deepEqual(listed.errors, []);
  assert.deepEqual(listed.projects[0], project);
  assert.ok(f.modelReadiness(project.model, project.simulator).length);
  const legacy = structuredClone(document);
  legacy.project.format = "gameplay-project-v2";
  legacy.project.templateId = null;
  delete legacy.project.exampleId;
  delete legacy.project.simulator;
  delete legacy.project.brief;
  assert.throws(() => f.parseProjectDocument(legacy, project));
});
test("hand-authored blank games persist simulator-aware runs and experiments across host restarts", async (t) => {
  const host = await createProjectHost();
  t.after(() => rm(host.root, { recursive: true, force: true }));
  const repo = f.createProjectRepository(host.data, host.files),
    history = f.createHistoryRepository(host.data, host.files),
    settings = f.createPlaytestRepository(host.data, host.files),
    ids = [];
  for (const id of ["resource-turns", "card-combination"]) {
    const project = await repo.create({
      name: id,
      parent: host.projectsPath,
      source: "blank",
      simulator: { id, version: id === "card-combination" ? 2 : 1 },
    });
    if (id === "card-combination")
      project.model = f.blankCardModel(project.model.name);
    project.model.fields.push({
      id: "my-score",
      name: "心愿",
      description: "",
      initial: 0,
      role: "progress",
    });
    project.model.actions.push({
      id: "my-action",
      name: "实现心愿",
      description: "",
      costs: [],
      requires: [],
      effects: [{ type: "add", field: "my-score", value: 3 }],
    });
    project.model.goals.push({
      id: "my-goal",
      name: "满足心愿",
      description: "",
      field: "my-score",
      threshold: 6,
    });
    if (id === "card-combination") {
      project.model.cards.push(
        {
          id: "my-one",
          name: "远行",
          description: "",
          group: "旅行",
          value: 2,
        },
        {
          id: "my-two",
          name: "相遇",
          description: "",
          group: "相识",
          value: 4,
        },
      );
      project.model.decks.push({
        id: "my-deck",
        name: "心愿牌",
        handSize: 1,
        initialDraw: 1,
        minSelect: 1,
        maxSelect: 1,
        refill: "after-play",
        recycle: "shuffle-discard",
        entries: [
          { card: "my-one", count: 1 },
          { card: "my-two", count: 1 },
        ],
      });
      project.model.actions[0].effects = [
        {
          type: "combination",
          collection: "my-deck",
          field: "my-score",
          multiplierValue: 1,
          pairBonus: 0,
        },
      ];
    }
    project.versions.push({
      id: "version-original",
      gameType: project.gameType,
      direction: project.direction,
      brief: structuredClone(project.brief),
      name: "初始规则",
      model: structuredClone(project.model),
      simulator: structuredClone(project.simulator),
      createdAt: project.createdAt,
    });
    await repo.saveProject(project);
    const config = await settings.load(project);
    config.scenarios[0].seedCount = 1;
    config.comparedStrategies = ["goal"];
    await settings.save(project, config);
    const trial = f.newTrial(
      project.id,
      project.model,
      42,
      1,
      f.selectedSetup(config, project.model),
      project.simulator,
    );
    trial.run = f.advanceSimulatedRun(trial.run, f.trialChoice(trial).choice);
    trial.drivers.push("manual");
    await history.save(project, trial);
    // Changing the current selection is a draft edit; old runs keep the recorded simulator.
    project.simulator = {
      id: id === "resource-turns" ? "card-combination" : "resource-turns",
      version: id === "resource-turns" ? 2 : 1,
    };
    await repo.saveProject(project);
    ids.push({ project: project.id, simulator: id });
  }
  await host.close(false);
  const restarted = await createProjectHost(host.root);
  t.after(() => restarted.close());
  const repo2 = f.createProjectRepository(restarted.data, restarted.files),
    h2 = f.createHistoryRepository(restarted.data, restarted.files),
    cfg2 = f.createPlaytestRepository(restarted.data, restarted.files),
    workspace2 = await repo2.list();
  assert.deepEqual(workspace2.errors, []);
  assert.equal(workspace2.projects.length, 2);
  for (const project of workspace2.projects) {
    const record = ids.find((i) => i.project === project.id),
      hist = await h2.list(project);
    assert.deepEqual(hist.errors, []);
    let trial = hist.trials[0];
    assert.equal(trial.run.simulator.id, record.simulator);
    assert.notEqual(project.simulator.id, record.simulator);
    assert.ok(f.modelReadiness(project.model, project.simulator).length);
    trial = {
      ...trial,
      run: f.advanceSimulatedRun(trial.run, f.trialChoice(trial).choice),
      drivers: [...trial.drivers, "manual"],
    };
    await h2.save(project, trial);
    assert.equal(f.current(trial.run).outcome.kind, "won");
    const config = await cfg2.load(project),
      experiment = f.prepareComparison(project, config, {
        mode: "parameter",
        baseline: "version-original",
        scan: {
          parameter: {
            kind: "effect",
            action: "my-action",
            index: 0,
            property:
              record.simulator === "card-combination"
                ? "multiplierValue"
                : "value",
          },
          from: 1,
          to: 2,
          step: 1,
        },
      });
    let sample;
    while ((sample = f.nextSample(experiment))) experiment.samples.push(sample);
    experiment.status = "completed";
    await h2.save(project, experiment);
    const reloaded = await h2.list(project);
    assert.deepEqual(reloaded.errors, []);
    assert.equal(reloaded.experiments[0].format, "gameplay-experiment-v4");
    assert.equal(reloaded.experiments[0].simulator.id, record.simulator);
    assert.equal(project.exampleId, null);
  }
});

test("game types create different editable schemas and reject incompatible sources before touching files", async (t) => {
  const e = await fixture(t);
  const p = await e.repo.create({
    name: "空白叙事",
    parent: e.projectsPath,
    gameType: "narrative",
    direction: null,
    source: "blank",
  });
  assert.equal(p.model.format, "gameplay-narrative-v1");
  assert.equal(p.model.fields, undefined);
  assert.deepEqual(p.model.nodes, []);
  assert.equal(p.simulator, null);
  assert.equal(p.direction, null);
  assert.deepEqual((await e.repo.reload(p)).model, p.model);
  await assert.rejects(
    e.repo.create({
      name: "错误来源",
      parent: e.projectsPath,
      gameType: "narrative",
      source: "example",
      exampleId: "combination",
    }),
    /不兼容/,
  );
  await assert.rejects(
    e.repo.create({
      name: "错误方向",
      parent: e.projectsPath,
      gameType: "card",
      direction: "branching-story",
    }),
    /不兼容/,
  );
  assert.deepEqual((await readdir(e.projectsPath)).sort(), ["空白叙事"]);
});
test("narrative rules, versions, and independent run history survive production host restarts", async (t) => {
  const host = await createProjectHost();
  t.after(() => rm(host.root, { recursive: true, force: true }));
  const repo = f.createProjectRepository(host.data, host.files),
    history = f.createNarrativeHistory(host.data, host.files);
  const p = await repo.create({
    name: "原创剧情",
    parent: host.projectsPath,
    gameType: "narrative",
    direction: "branching-story",
  });
  p.model.characters.push({
    id: "guide",
    name: "向导",
    description: "知道出口",
  });
  p.model.variables.push({
    id: "key",
    name: "持有钥匙",
    type: "boolean",
    initial: false,
  });
  p.model.startNode = "start";
  p.model.nodes = [
    {
      id: "start",
      title: "门前",
      text: "向导递给你钥匙。",
      speaker: "guide",
      ending: false,
      choices: [
        {
          id: "take",
          label: "收下钥匙",
          target: "exit",
          conditions: [],
          effects: [{ variable: "key", operation: "set", value: true }],
        },
      ],
    },
    {
      id: "exit",
      title: "离开",
      text: "你推开了门。",
      speaker: "",
      ending: true,
      choices: [],
    },
  ];
  p.versions.push({
    id: "story-v1",
    name: "初稿",
    createdAt: "now",
    model: structuredClone(p.model),
    gameType: p.gameType,
    direction: p.direction,
    simulator: p.simulator,
    brief: structuredClone(p.brief),
  });
  await repo.saveProject(p);
  let r = f.newStoryRecord(p.id, p.model);
  await history.save(p, r);
  p.model.nodes[1].text = "新的草稿结局";
  await repo.saveProject(p);
  await host.close(false);
  const restarted = await createProjectHost(host.root);
  t.after(() => restarted.close());
  const next = f.createProjectRepository(restarted.data, restarted.files),
    h = f.createNarrativeHistory(restarted.data, restarted.files),
    loaded = (await next.list()).projects[0];
  assert.equal(loaded.model.nodes[1].text, "新的草稿结局");
  assert.equal(loaded.versions[0].model.nodes[1].text, "你推开了门。");
  const records = await h.list(loaded);
  assert.deepEqual(records.errors, []);
  r = f.chooseStory(records.records[0], "take");
  await h.save(loaded, r);
  assert.equal(r.final.outcome, "ending");
  assert.equal(r.final.values.key, true);
  assert.equal(r.model.nodes[1].text, "你推开了门。");
  assert.equal((await h.list(loaded)).records[0].decisions.length, 1);
  const text = JSON.parse(await readFile(f.projectFile(loaded.path), "utf8"));
  assert.equal(text.project.gameType, "narrative");
  assert.equal(text.project.direction, "branching-story");
  assert.equal(text.flow, undefined);
  const index = await restarted.data.storage.getItem(f.LIBRARY_KEY);
  assert.equal(JSON.stringify(index).includes("characters"), false);
});
test("narrative history protects external changes and isolates corrupted or unsupported records", async (t) => {
  const e = await fixture(t),
    p = await e.repo.create({
      name: "记录检查",
      parent: e.projectsPath,
      gameType: "narrative",
      direction: "branching-story",
    });
  p.model.startNode = "start";
  p.model.nodes = [
    {
      id: "start",
      title: "结局",
      text: "故事结束。",
      speaker: "",
      ending: true,
      choices: [],
    },
  ];
  await e.repo.saveProject(p);
  const h = f.createNarrativeHistory(e.data, e.files),
    r = f.newStoryRecord(p.id, p.model);
  await h.save(p, r);
  const path = join(p.path, "runs", r.id + ".json");
  const external = structuredClone(r);
  external.updatedAt = "外部变更";
  await externalWrite(path, external);
  r.updatedAt = "旧页面的新日期";
  await assert.rejects(h.save(p, r), /外部修改|FILE_CHANGED/);
  assert.equal(JSON.parse(await readFile(path, "utf8")).updatedAt, "外部变更");
  await writeFile(join(p.path, "runs", "broken.json"), "broken");
  const unsupported = structuredClone(r);
  unsupported.id = "unsupported";
  unsupported.simulator.version = 2;
  await writeFile(
    join(p.path, "runs", "unsupported.json"),
    JSON.stringify(unsupported),
  );
  const result = await h.list(p);
  assert.equal(result.records.length, 1);
  assert.equal(result.errors.length, 2);
  assert.equal(
    await readFile(join(p.path, "runs", "broken.json"), "utf8"),
    "broken",
  );
});

test("oversized narrative version collections cannot make the project unreadable", async (t) => {
  const e = await fixture(t),
    p = await e.repo.create({
      name: "容量边界",
      parent: e.projectsPath,
      gameType: "narrative",
      direction: "branching-story",
    }),
    before = await readFile(f.projectFile(p.path), "utf8");
  p.model.startNode = "scene-0";
  p.model.nodes = Array.from({ length: 80 }, (_, i) => ({
    id: `scene-${i}`,
    title: `剧情${i}`,
    text: "文".repeat(7500),
    speaker: "",
    ending: true,
    choices: [],
  }));
  p.versions = Array.from({ length: 3 }, (_, i) => ({
    id: `v-${i}`,
    name: `版本${i}`,
    createdAt: "now",
    model: structuredClone(p.model),
    gameType: "narrative",
    direction: "branching-story",
    simulator: p.simulator,
    brief: structuredClone(p.brief),
  }));
  await assert.rejects(e.repo.saveProject(p), /4 MiB/);
  assert.equal(await readFile(f.projectFile(p.path), "utf8"), before);
  assert.deepEqual((await e.repo.reload(p)).model.nodes, []);
});
