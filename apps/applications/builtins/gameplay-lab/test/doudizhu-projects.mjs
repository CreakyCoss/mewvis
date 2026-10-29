import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { f } from "./helpers/domain.mjs";
import { createProjectHost } from "./host-fixture.mjs";

test("preset creation and custom assembly persist the same skeleton, module and layout references across restart", async (t) => {
  let host = await createProjectHost();
  t.after(() => host.close());
  let repo = f.createProjectRepository(host.data, host.files);
  let p = await repo.create({
    name: "组合方案",
    parent: host.projectsPath,
    direction: "doudizhu",
    presetId: "hero-doudizhu",
  });
  assert.equal(f.matchingDoudizhuPreset(p.model), "hero-doudizhu");
  p.model.rules.baseScore = 4;
  p.model.extensions.heroes.seats[0].name = "自己的英雄";
  p.versions.push({
    id: "custom-assembly",
    name: "组合版本",
    createdAt: new Date().toISOString(),
    gameType: p.gameType,
    direction: p.direction,
    simulator: structuredClone(p.simulator),
    brief: structuredClone(p.brief),
    model: structuredClone(p.model),
  });
  await repo.saveProject(p);
  let record = f.newDoudizhuRecord(p.id, p.model);
  record = f.advanceDoudizhuRecord(record, {
    type: "bid",
    player: 0,
    value: 3,
  });
  record = f.advanceDoudizhuRecord(record, {
    type: "skill",
    player: 0,
    skillId: "insight",
    target: 1,
  });
  await f.createDoudizhuHistory(host.data, host.files).save(p, record);
  f.setDoudizhuModuleEnabled(p.model, "heroes", false);
  await repo.saveProject(p);
  const root = host.root;
  await host.close(false);
  host = await createProjectHost(root);
  repo = f.createProjectRepository(host.data, host.files);
  p = (await repo.list()).projects[0];
  assert.deepEqual(p.model.composition.modules, []);
  assert.equal(p.model.extensions.heroes.seats[0].name, "自己的英雄");
  assert.equal(p.versions[0].model.composition.modules[0].id, "heroes");
  const records = await f.createDoudizhuHistory(host.data, host.files).list(p);
  assert.deepEqual(records.errors, []);
  assert.deepEqual(records.records[0], record);
  assert.equal(records.records[0].composition.modules[0].version, 1);
  assert.deepEqual(f.doudizhuReplay(records.records[0]), record.final);
  const bytes = await readFile(join(p.path, "models/core.json"), "utf8");
  const invalid = JSON.parse(bytes);
  invalid.composition.layout.version = 99;
  await writeFile(join(p.path, "models/core.json"), JSON.stringify(invalid));
  assert.equal((await repo.list()).incompatible.length, 1);
  assert.deepEqual(
    JSON.parse(await readFile(join(p.path, "models/core.json"), "utf8")),
    invalid,
  );
});

test("unsupported presets and cross-framework preset requests create no directories", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files);
  await assert.rejects(
    repo.create({
      name: "错误预设",
      parent: host.projectsPath,
      direction: "doudizhu",
      presetId: "unknown",
    }),
    /预设不受支持/,
  );
  await assert.rejects(
    repo.create({
      name: "错误框架",
      parent: host.projectsPath,
      direction: "card-scoring",
      presetId: "hero-doudizhu",
    }),
    /不兼容/,
  );
  assert.deepEqual(await readdir(host.projectsPath), []);
});

test("hero configuration, private results and frozen module versions survive restart and draft disable", async (t) => {
  let host = await createProjectHost();
  t.after(() => host.close());
  let repo = f.createProjectRepository(host.data, host.files);
  let project = await repo.create({
    name: "英雄续玩",
    parent: host.projectsPath,
    direction: "doudizhu",
  });
  f.setDoudizhuModuleEnabled(project.model, "heroes", true);
  project.model.extensions.heroes.seats[0].name = "我的英雄";
  await repo.saveProject(project);
  let record = f.newDoudizhuRecord(project.id, project.model, 42);
  record = f.advanceDoudizhuRecord(record, {
    type: "bid",
    player: 0,
    value: 3,
  });
  record = f.advanceDoudizhuRecord(record, {
    type: "skill",
    player: 0,
    skillId: "insight",
    target: 1,
  });
  await f.createDoudizhuHistory(host.data, host.files).save(project, record);
  const root = host.root;
  await host.close(false);
  host = await createProjectHost(root);
  repo = f.createProjectRepository(host.data, host.files);
  project = (await repo.list()).projects[0];
  assert.equal(project.model.extensions.heroes.seats[0].name, "我的英雄");
  const history = f.createDoudizhuHistory(host.data, host.files),
    loaded = await history.list(project);
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.records, [record]);
  f.setDoudizhuModuleEnabled(project.model, "heroes", false);
  await repo.saveProject(project);
  assert.equal(
    f.newDoudizhuRecord(project.id, project.model).final.heroes,
    undefined,
  );
  record = loaded.records[0];
  assert.equal(record.model.extensions.heroes.version, 1);
  assert.equal(record.model.extensions.heroes.enabled, true);
  assert.equal(
    f.observeDoudizhu(record.model, record.final, 0).heroes.reveals[0].cards
      .length,
    1,
  );
  assert.deepEqual(
    f.observeDoudizhu(record.model, record.final, 1).heroes.reveals,
    [],
  );
  const command = f.chooseDoudizhu(
    record.model,
    f.observeDoudizhu(record.model, record.final, 0),
  );
  record = f.advanceDoudizhuRecord(record, command);
  await history.save(project, record);
  assert.deepEqual((await history.list(project)).records, [record]);
  assert.deepEqual(f.doudizhuReplay(record), record.final);
  assert.equal(f.doudizhuReplay(record, 1).heroes.reveals[0].length, 0);
});

test("a Doudizhu project owns its schema, custom rules, versions and resumable records across host restarts", async (t) => {
  let host = await createProjectHost();
  t.after(() => host.close());
  let repo = f.createProjectRepository(host.data, host.files);
  let project = await repo.create({
    name: "自定义斗地主",
    parent: host.projectsPath,
    direction: "doudizhu",
  });
  assert.equal(project.gameType, "card");
  assert.equal(project.model.format, "gameplay-doudizhu-v1");
  assert.deepEqual(f.projectReadiness(project), []);
  project.model.rules.straightMin = 4;
  project.versions.push({
    id: "rules-before",
    name: "四张顺子",
    createdAt: new Date().toISOString(),
    gameType: project.gameType,
    direction: project.direction,
    simulator: project.simulator,
    brief: structuredClone(project.brief),
    model: structuredClone(project.model),
  });
  await repo.saveProject(project);
  let history = f.createDoudizhuHistory(host.data, host.files),
    record = f.newDoudizhuRecord(project.id, project.model, 24);
  for (let i = 0; i < 10; i++)
    record = f.advanceDoudizhuRecord(
      record,
      f.chooseDoudizhu(
        record.model,
        f.observeDoudizhu(record.model, record.final, record.final.actor),
      ),
    );
  await history.save(project, record);
  const root = host.root;
  await host.close(false);
  host = await createProjectHost(root);
  repo = f.createProjectRepository(host.data, host.files);
  history = f.createDoudizhuHistory(host.data, host.files);
  project = (await repo.list()).projects[0];
  assert.equal(project.model.rules.straightMin, 4);
  assert.equal(project.versions[0].model.rules.straightMin, 4);
  const loaded = await history.list(project);
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.records, [record]);
  project.model.rules.baseScore = 10;
  await repo.saveProject(project);
  while (record.final.phase !== "finished")
    record = f.advanceDoudizhuRecord(
      record,
      f.chooseDoudizhu(
        record.model,
        f.observeDoudizhu(record.model, record.final, record.final.actor),
      ),
    );
  await history.save(project, record);
  assert.equal(record.model.rules.baseScore, 1);
  assert.deepEqual(f.doudizhuReplay(record), record.final);
  assert.equal(
    (await history.list(project)).records[0].final.phase,
    "finished",
  );
});

test("cross-framework examples and model substitution fail without overwriting the Doudizhu project", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files);
  await assert.rejects(
    repo.create({
      name: "错误来源",
      parent: host.projectsPath,
      gameType: "card",
      direction: "doudizhu",
      source: "example",
      exampleId: "combination",
    }),
    /框架不兼容/,
  );
  assert.deepEqual(await readdir(host.projectsPath), []);
  const p = await repo.create({
    name: "框架边界",
    parent: host.projectsPath,
    direction: "doudizhu",
  });
  const path = join(p.path, "models/core.json"),
    before = await readFile(path, "utf8");
  await assert.rejects(repo.reset(p, "combination"), /斗地主不能/);
  assert.equal(await readFile(path, "utf8"), before);
  const wrong = structuredClone(p);
  wrong.direction = "card-scoring";
  await assert.rejects(repo.saveProject(wrong), /不一致/);
  assert.equal(await readFile(path, "utf8"), before);
});

test("unknown Doudizhu modules and tampered histories remain on disk until explicitly removed", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files);
  const p = await repo.create({
      name: "异常保留",
      parent: host.projectsPath,
      direction: "doudizhu",
    }),
    history = f.createDoudizhuHistory(host.data, host.files),
    record = f.newDoudizhuRecord(p.id, p.model, 7);
  await history.save(p, record);
  const runPath = join(p.path, "runs", record.id + ".json"),
    bad = structuredClone(record);
  bad.final.multiplier = 99;
  const bytes = JSON.stringify(bad);
  await writeFile(runPath, bytes);
  await assert.rejects(
    history.save(p, {
      ...record,
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    }),
    /外部修改/,
  );
  const loaded = await history.list(p);
  assert.equal(loaded.incompatible.length, 1);
  assert.equal(await readFile(runPath, "utf8"), bytes);
  const modelPath = join(p.path, "models/core.json"),
    model = JSON.parse(await readFile(modelPath, "utf8"));
  model.extensions.heroes = { enabled: true };
  const modelBytes = JSON.stringify(model);
  await writeFile(modelPath, modelBytes);
  const library = await repo.list();
  assert.equal(library.incompatible.length, 1);
  assert.equal(await readFile(modelPath, "utf8"), modelBytes);
});
