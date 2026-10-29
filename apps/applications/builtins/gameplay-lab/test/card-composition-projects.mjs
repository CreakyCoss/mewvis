import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { f } from "./helpers/domain.mjs";
import { createProjectHost } from "./host-fixture.mjs";

test("registered card preset, authored modules, versions and frozen runs survive restart and preset changes", async (t) => {
  let host = await createProjectHost();
  t.after(() => host.close());
  let repo = f.createProjectRepository(host.data, host.files);
  let p = await repo.create({
    name: "装配计分",
    parent: host.projectsPath,
    direction: "card-scoring",
    presetId: "paired-scoring",
  });
  assert.deepEqual(p.model.cards, []);
  p.model.cards = [
    { id: "red", name: "红牌", description: "", group: "red", value: 3 },
  ];
  Object.assign(p.model.decks[0], {
    entries: [{ card: "red", count: 4 }],
    handSize: 2,
    initialDraw: 2,
    minSelect: 2,
    maxSelect: 2,
  });
  p.model.goals[0].threshold = 1000;
  p.model.actions[0].effects[0].pairBonus = 31;
  p.versions.push({
    id: "paired",
    name: "奖励规则",
    createdAt: p.createdAt,
    gameType: p.gameType,
    direction: p.direction,
    simulator: structuredClone(p.simulator),
    brief: structuredClone(p.brief),
    model: structuredClone(p.model),
  });
  await repo.saveProject(p);
  let history = f.createHistoryRepository(host.data, host.files),
    trial = f.newTrial(p.id, p.model, 42, 1, undefined, p.simulator);
  const decision = f.trialChoice(trial);
  trial.run = f.advanceSimulatedRun(trial.run, decision.choice);
  trial.drivers.push(decision.driver);
  await history.save(p, trial);
  f.applyCardScoringPreset(p.model, "base-scoring");
  await repo.saveProject(p);
  const root = host.root;
  await host.close(false);
  host = await createProjectHost(root);
  repo = f.createProjectRepository(host.data, host.files);
  history = f.createHistoryRepository(host.data, host.files);
  p = (await repo.list()).projects[0];
  assert.deepEqual(p.model.composition.modules, []);
  assert.equal(p.model.actions[0].effects[0].pairBonus, 31);
  assert.equal(p.versions[0].model.composition.modules[0].id, "pair-reward");
  const saved = await history.list(p);
  assert.deepEqual(saved.errors, []);
  assert.deepEqual(saved.trials, [trial]);
  let resumed = saved.trials[0];
  const field = p.model.goals[0].field,
    previous = f.current(resumed.run).players[0].values[field];
  resumed = {
    ...resumed,
    run: f.advanceSimulatedRun(resumed.run, f.trialChoice(resumed).choice),
    drivers: [...resumed.drivers, "goal"],
  };
  assert.equal(f.current(resumed.run).players[0].values[field] - previous, 37);
  await history.save(p, resumed);
  const basic = f.newTrial(p.id, p.model, 42, 1, undefined, p.simulator);
  const next = f.advanceSimulatedRun(basic.run, f.trialChoice(basic).choice);
  assert.equal(f.current(next).players[0].values[field], 6);
  const runPath = join(p.path, "runs", resumed.id + ".json"),
    bytes = await readFile(runPath, "utf8"),
    tampered = JSON.parse(bytes);
  tampered.log.composition.layout.version = 99;
  await writeFile(runPath, JSON.stringify(tampered));
  assert.equal((await history.list(p)).incompatible.length, 1);
  assert.deepEqual(JSON.parse(await readFile(runPath, "utf8")), tampered);
});

test("examples and explicit sample reset use the registered assembly without changing authored sample content", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files);
  let p = await repo.create({
    name: "示例组合",
    parent: host.projectsPath,
    exampleId: "combination",
  });
  assert.equal(p.model.composition.skeleton.id, "card-scoring");
  assert.deepEqual(p.model.cards, f.exampleModel("combination").cards);
  f.applyCardScoringPreset(p.model, "base-scoring");
  await repo.saveProject(p);
  p = (await repo.reset(p, "combination")).project;
  assert.equal(p.model.composition.modules[0].id, "pair-reward");
  assert.deepEqual(p.model.cards, f.exampleModel("combination").cards);
  const dirs = await readdir(host.projectsPath);
  await assert.rejects(
    repo.create({
      name: "错误预设",
      parent: host.projectsPath,
      direction: "card-scoring",
      presetId: "hero-doudizhu",
    }),
    /不兼容/,
  );
  assert.deepEqual(await readdir(host.projectsPath), dirs);
});

test("shared insight config and private checkpoints survive file restart, frozen-rule edits and failed saves", async (t) => {
  let host = await createProjectHost();
  t.after(() => host.close());
  let repo = f.createProjectRepository(host.data, host.files);
  let project = await repo.create({
    name: "双人洞察",
    parent: host.projectsPath,
    exampleId: "combination",
  });
  f.setCardScoringModuleEnabled(project.model, "heroes", true);
  project.model.extensions.heroes.seats[0].name = "洞察验证";
  project.model.extensions.heroes.seats[0].skill.count = 2;
  await repo.saveProject(project);
  let history = f.createHistoryRepository(host.data, host.files);
  let trial = f.newTrial(
    project.id,
    project.model,
    42,
    2,
    undefined,
    project.simulator,
  );
  await history.save(project, trial);
  const next = {
    ...trial,
    run: f.advanceSimulatedRun(trial.run, {
      action: "__module",
      command: { type: "skill", player: 0, target: 1, skillId: "insight" },
    }),
    drivers: ["manual"],
  };
  // The session publishes a new trial only after persistence succeeds.
  const failing = f.createHistoryRepository(host.data, {
    ...host.files,
    writeText: async () => {
      throw new Error("disk unavailable");
    },
  });
  await assert.rejects(failing.save(project, next));
  assert.deepEqual((await history.list(project)).trials, [trial]);
  assert.equal(trial.run.heroes.used[0], 0);
  await history.save(project, next);
  trial = next;
  f.setCardScoringModuleEnabled(project.model, "heroes", false);
  project.model.extensions.heroes.seats[0].name = "新配置";
  await repo.saveProject(project);
  const root = host.root;
  await host.close(false);
  host = await createProjectHost(root);
  repo = f.createProjectRepository(host.data, host.files);
  history = f.createHistoryRepository(host.data, host.files);
  project = (await repo.list()).projects[0];
  assert.equal(project.model.extensions.heroes.enabled, false);
  assert.equal(project.model.extensions.heroes.seats[0].name, "新配置");
  const saved = await history.list(project);
  assert.deepEqual(saved.errors, []);
  assert.deepEqual(saved.trials, [trial]);
  const restored = saved.trials[0].run;
  assert.equal(restored.model.extensions.heroes.seats[0].name, "洞察验证");
  assert.equal(
    f.cardScoringRuntime.observe(restored.model, restored, 0).heroes.reveals[0]
      .cards.length,
    2,
  );
  assert.deepEqual(
    f.cardScoringRuntime.observe(restored.model, restored, 1).heroes.reveals,
    [],
  );
  assert.deepEqual(
    f.cardScoringRuntime.observe(
      restored.model,
      f.cardScoringRunAtStep(restored, 0),
      0,
    ).heroes.reveals,
    [],
  );
  assert.equal(
    f.advanceSimulatedRun(restored, { action: "__end_turn" }).heroes.used[0],
    1,
  );
  const path = join(project.path, "runs", trial.id + ".json");
  const tampered = JSON.parse(await readFile(path, "utf8"));
  tampered.log.choices[0].command.target = 0;
  await writeFile(path, JSON.stringify(tampered));
  assert.equal((await history.list(project)).incompatible.length, 1);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), tampered);
});
