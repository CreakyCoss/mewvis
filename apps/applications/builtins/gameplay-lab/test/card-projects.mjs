import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { f } from "./helpers/domain.mjs";
import { cardGame } from "./helpers/card-game.mjs";
import { createProjectHost } from "./host-fixture.mjs";

test("independent card rules, instances, versions and configured experiments survive a production host restart", async (t) => {
  const host = await createProjectHost();
  t.after(() => rm(host.root, { recursive: true, force: true }));
  const repo = f.createProjectRepository(host.data, host.files),
    history = f.createHistoryRepository(host.data, host.files),
    settings = f.createPlaytestRepository(host.data, host.files);
  const project = await repo.create({
    name: "自定牌局",
    parent: host.projectsPath,
    gameType: "card",
    direction: "card-scoring",
    source: "blank",
  });
  assert.equal(project.model.format, "gameplay-card-v1");
  assert.deepEqual(project.model.cards, []);
  assert.deepEqual(project.simulator, f.cardSimulator);
  project.model = cardGame();
  project.model.goals[0].threshold = 20;
  project.versions.push({
    id: "original",
    name: "最初构筑",
    createdAt: project.createdAt,
    model: structuredClone(project.model),
    simulator: f.cardSimulator,
    gameType: "card",
    direction: "card-scoring",
    brief: project.brief,
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
  trial.drivers.push("goal");
  await history.save(project, trial);
  const experiment = f.newConfiguredExperiment(
    project.id,
    project.model,
    f.selectedSetup(config, project.model, true),
    project.simulator,
  );
  await history.save(project, experiment);
  project.model.cards[0].value = 99;
  project.model.decks[0].refill = "none";
  await repo.saveProject(project);
  await host.close(false);
  const restarted = await createProjectHost(host.root);
  t.after(() => restarted.close());
  const nextRepo = f.createProjectRepository(restarted.data, restarted.files),
    nextHistory = f.createHistoryRepository(restarted.data, restarted.files);
  const library = await nextRepo.list();
  assert.deepEqual(library.errors, []);
  const loaded = library.projects[0];
  assert.equal(loaded.model.cards[0].value, 99);
  assert.equal(loaded.versions[0].model.cards[0].value, 2);
  const saved = await nextHistory.list(loaded);
  assert.deepEqual(saved.errors, []);
  let resumed = saved.trials[0];
  assert.deepEqual(resumed, trial);
  while (!f.current(resumed.run).outcome) {
    resumed = {
      ...resumed,
      run: f.advanceSimulatedRun(resumed.run, f.trialChoice(resumed).choice),
      drivers: [...resumed.drivers, "goal"],
    };
    await nextHistory.save(loaded, resumed);
  }
  assert.equal(f.current(resumed.run).outcome.kind, "won");
  assert.equal(resumed.run.model.cards[0].value, 2);
  const exp = saved.experiments[0];
  assert.equal(exp.status, "interrupted");
  exp.samples.push(f.nextSample(exp));
  exp.status = "completed";
  await nextHistory.save(loaded, exp);
  assert.equal(exp.samples[0].error, undefined);
  assert.deepEqual((await nextHistory.list(loaded)).experiments[0], exp);
  const document = JSON.parse(
    await readFile(f.projectFile(loaded.path), "utf8"),
  );
  assert.equal(document.collections, undefined);
  assert.equal(document.decks[0].entries[0].count, 3);
  assert.equal(document.cards[0].definitionId, undefined);
});
test("loading incompatible projects preserves bytes, directories and index until explicit deletion", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    old = [];
  for (const kind of ["v2", "v3", "old-card", "future"]) {
    const p = await repo.create({
      name: `不兼容-${kind}`,
      parent: host.projectsPath,
      exampleId: "combination",
    });
    const document = f.projectDocument(p);
    if (kind === "v2" || kind === "v3")
      document.project.format = `gameplay-project-${kind}`;
    if (kind === "future") document.project.format = "gameplay-project-v99";
    if (kind === "old-card")
      Object.assign(document, {
        format: "gameplay-model-v1",
        collections: [{ id: "old", cards: [] }],
      });
    const text = JSON.stringify(document);
    await writeFile(f.projectFile(p.path), text);
    old.push({ p, text });
  }
  const current = [];
  for (const gameType of ["card", "systems", "narrative"])
    current.push(
      await repo.create({
        name: `当前-${gameType}`,
        parent: host.projectsPath,
        gameType,
      }),
    );
  const index = await host.data.storage.getItem(f.LIBRARY_KEY);
  const library = await repo.list();
  assert.equal(library.incompatible.length, 4);
  assert.deepEqual(library.errors, []);
  assert.deepEqual(
    library.projects.map((p) => p.id),
    current.map((p) => p.id),
  );
  // Loading again or choosing not to delete must not remove or rewrite anything.
  await repo.list();
  assert.deepEqual(await host.data.storage.getItem(f.LIBRARY_KEY), index);
  for (const { p, text } of old) {
    assert.equal(await readFile(f.projectFile(p.path), "utf8"), text);
    assert.equal(
      (await host.data.workspaces.get(p.workspaceId)).id,
      p.workspaceId,
    );
  }
  const selected = library.incompatible.find(
    (item) => item.path === old[0].p.path,
  );
  assert.match(selected.consequence, /整个项目目录/);
  await repo.deleteIncompatible(selected.id);
  await assert.rejects(access(old[0].p.path), { code: "ENOENT" });
  await assert.rejects(host.data.workspaces.get(old[0].p.workspaceId));
  assert.equal(
    (await host.data.storage.getItem(f.LIBRARY_KEY)).projects.length,
    index.projects.length - 1,
  );
  for (const { p, text } of old.slice(1))
    assert.equal(await readFile(f.projectFile(p.path), "utf8"), text);
  for (const p of current) assert.deepEqual(await repo.reload(p), p);
  await assert.rejects(repo.deleteIncompatible(selected.id), /待删除/);
});
test("incompatible named versions block opening without pruning versions or backups", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await repo.create({
      name: "保留版本",
      parent: host.projectsPath,
      exampleId: "combination",
    });
  const document = f.projectDocument(p);
  document.project.versions.push({
    id: "untyped",
    name: "旧版",
    createdAt: p.createdAt,
    model: f.makeTemplate(),
  });
  const text = JSON.stringify(document);
  await writeFile(f.projectFile(p.path), text);
  await mkdir(`${p.path}/backups`);
  await writeFile(`${p.path}/backups/old.json`, text);
  const library = await repo.list();
  assert.equal(library.projects.length, 0);
  assert.equal(library.incompatible.length, 1);
  assert.match(library.incompatible[0].reason, /命名版本/);
  assert.equal(await readFile(f.projectFile(p.path), "utf8"), text);
  assert.equal(await readFile(`${p.path}/backups/old.json`, "utf8"), text);
  await assert.rejects(repo.reload(p), /已保留/);
  await assert.rejects(repo.saveProject(p), /重新打开/);
  assert.equal(await readFile(f.projectFile(p.path), "utf8"), text);
});
test("incompatible histories are reported and only the explicitly selected file is deleted", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    history = f.createHistoryRepository(host.data, host.files);
  const p = await repo.create({
    name: "保留记录",
    parent: host.projectsPath,
    exampleId: "combination",
  });
  const trial = f.newTrial(p.id, p.model, 42, 1),
    experiment = f.newExperiment(p.id, p.model, 42, 1, "goal");
  await history.save(p, trial);
  await history.save(p, experiment);
  await mkdir(`${p.path}/backups`);
  await writeFile(
    `${p.path}/backups/old.json`,
    '{"project":{"format":"gameplay-project-v3"}}',
  );
  const paths = [];
  for (const format of [
    "gameplay-run-v1",
    "gameplay-run-v2",
    "gameplay-experiment-v1",
    "gameplay-experiment-v2",
    "gameplay-experiment-v3",
    "gameplay-run-v99",
  ]) {
    const path = `${p.path}/${format.startsWith("gameplay-run") ? "runs" : "experiments"}/${format}.json`,
      text = JSON.stringify({ format, id: format, projectId: p.id });
    await writeFile(path, text);
    paths.push({ path, text });
  }
  const core = await readFile(f.projectFile(p.path), "utf8"),
    records = await history.list(p);
  assert.equal(records.incompatible.length, paths.length);
  assert.equal(records.errors.length, paths.length);
  assert.deepEqual(records.trials, [trial]);
  assert.equal(records.experiments[0].id, experiment.id);
  for (const { path, text } of paths)
    assert.equal(await readFile(path, "utf8"), text);
  await history.list(p);
  for (const { path, text } of paths)
    assert.equal(await readFile(path, "utf8"), text);
  const selected = records.incompatible.find(
    (item) => item.path === paths[0].path,
  );
  await history.removeIncompatible(p, selected.id);
  await assert.rejects(access(paths[0].path), { code: "ENOENT" });
  for (const { path, text } of paths.slice(1))
    assert.equal(await readFile(path, "utf8"), text);
  assert.equal(await readFile(f.projectFile(p.path), "utf8"), core);
  assert.equal(
    await readFile(`${p.path}/backups/old.json`, "utf8"),
    '{"project":{"format":"gameplay-project-v3"}}',
  );
  assert.deepEqual((await history.list(p)).trials, [trial]);
});
test("changed project or history data invalidates a pending deletion", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await repo.create({
      name: "删除变更保护",
      parent: host.projectsPath,
      exampleId: "development",
    });
  const path = f.projectFile(p.path),
    current = await readFile(path, "utf8"),
    document = JSON.parse(current);
  document.project.format = "gameplay-project-v3";
  await writeFile(path, JSON.stringify(document));
  const library = await repo.list();
  await writeFile(path, current);
  await assert.rejects(
    repo.deleteIncompatible(library.incompatible[0].id),
    /外部修改/,
  );
  assert.equal(await readFile(path, "utf8"), current);
  await repo.reload(p);
  const history = f.createHistoryRepository(host.data, host.files);
  await mkdir(`${p.path}/runs`);
  const record = `${p.path}/runs/old.json`;
  await writeFile(record, '{"format":"gameplay-run-v1"}');
  const records = await history.list(p),
    replacement = '{"format":"gameplay-run-v99"}';
  await writeFile(record, replacement);
  await assert.rejects(
    history.removeIncompatible(p, records.incompatible[0].id),
    /外部修改/,
  );
  assert.equal(await readFile(record, "utf8"), replacement);
  await assert.rejects(
    history.removeIncompatible(
      { ...p, id: "another-project" },
      records.incompatible[0].id,
    ),
    /标识/,
  );
});
test("opening an incompatible directory reports a deletable candidate without deleting or indexing it", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await repo.create({
      name: "手动打开",
      parent: host.projectsPath,
      exampleId: "development",
    });
  const document = f.projectDocument(p);
  document.project.format = "gameplay-project-v3";
  const text = JSON.stringify(document);
  await writeFile(f.projectFile(p.path), text);
  await host.data.storage.removeItem(f.LIBRARY_KEY);
  let issue;
  await assert.rejects(repo.open(p.path), (error) => {
    issue = error.item;
    return !!issue;
  });
  assert.equal(issue.path, p.path);
  assert.equal(await readFile(f.projectFile(p.path), "utf8"), text);
  assert.equal(await host.data.storage.getItem(f.LIBRARY_KEY), null);
  await repo.deleteIncompatible(issue.id);
  await assert.rejects(access(p.path), { code: "ENOENT" });
});
test("narrative histories also require explicit deletion and preserve current records", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await repo.create({
      name: "叙事确认删除",
      parent: host.projectsPath,
      gameType: "narrative",
      direction: "branching-story",
    });
  p.model.startNode = "end";
  p.model.nodes.push({
    id: "end",
    title: "结局",
    text: "结束",
    speaker: "",
    ending: true,
    choices: [],
  });
  await repo.saveProject(p);
  const history = f.createNarrativeHistory(host.data, host.files),
    record = f.newStoryRecord(p.id, p.model);
  await history.save(p, record);
  const path = `${p.path}/runs/old.json`,
    text = '{"format":"gameplay-story-run-v99"}';
  await writeFile(path, text);
  const result = await history.list(p);
  assert.equal(result.incompatible.length, 1);
  assert.deepEqual(result.records, [record]);
  assert.equal(await readFile(path, "utf8"), text);
  await history.removeIncompatible(p, result.incompatible[0].id);
  await assert.rejects(access(path), { code: "ENOENT" });
  assert.deepEqual((await history.list(p)).records, [record]);
});
test("unfinished card quantities and orphan references save as drafts but cross-type model versions are rejected", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files);
  const project = await repo.create({
    name: "卡牌草稿",
    parent: host.projectsPath,
    gameType: "card",
  });
  project.model = cardGame();
  project.model.decks[0].entries[0].card = "missing";
  await repo.saveProject(project);
  const loaded = await repo.reload(project);
  assert.equal(loaded.model.decks[0].entries[0].card, "missing");
  assert.ok(f.projectReadiness(loaded).length);
  const bad = structuredClone(loaded);
  bad.gameType = "systems";
  bad.direction = "resource-development";
  await assert.rejects(repo.saveProject(bad), /不一致/);
  const document = f.projectDocument(loaded);
  document.project.versions = [
    {
      id: "invalid",
      name: "跨类型",
      createdAt: project.createdAt,
      gameType: "systems",
      model: cardGame(),
      simulator: f.cardSimulator,
    },
  ];
  assert.throws(
    () => f.parseProjectDocument(document, loaded),
    /无法读取|不一致/,
  );
});
