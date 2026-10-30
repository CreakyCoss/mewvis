import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { f } from "./helpers/domain.mjs";
import { boardGame } from "./helpers/board-game.mjs";
import { createProjectHost } from "./host-fixture.mjs";
const create = async (host, repo, name = "自己的棋盘") => {
  const project = await repo.create({
    name,
    parent: host.projectsPath,
    gameType: "board",
    direction: "board-economy",
  });
  assert.deepEqual(project.model.tiles, []);
  boardGame(project.model);
  await repo.saveProject(project);
  return project;
};

test("blank board content, named versions, frozen purchase decisions and completed games survive production restart", async (t) => {
  let host = await createProjectHost();
  t.after(() => host.close());
  let repo = f.createProjectRepository(host.data, host.files),
    p = await create(host, repo);
  assert.deepEqual(f.projectReadiness(p), []);
  assert.equal(p.model.format, "gameplay-board-economy-v1");
  assert.equal(p.gameType, "board");
  p.versions.push({
    id: "original",
    name: "原始棋局",
    createdAt: p.createdAt,
    gameType: p.gameType,
    direction: p.direction,
    simulator: structuredClone(p.simulator),
    brief: structuredClone(p.brief),
    model: structuredClone(p.model),
  });
  await repo.saveProject(p);
  let history = f.createBoardHistory(host.data, host.files),
    r = f.newBoardRecord(p.id, p.model, 42);
  r = f.advanceBoardRecord(r, { type: "roll", player: 0 });
  assert.equal(r.final.phase, "purchase");
  await history.save(p, r);
  Object.assign(p.model.rules, { initialCash: 1000, salary: 100 });
  p.model.tiles[1].rent = 1;
  await repo.saveProject(p);
  const root = host.root;
  await host.close(false);
  host = await createProjectHost(root);
  repo = f.createProjectRepository(host.data, host.files);
  history = f.createBoardHistory(host.data, host.files);
  p = (await repo.list()).projects[0];
  assert.equal(p.model.rules.initialCash, 1000);
  assert.equal(p.versions[0].model.tiles[1].rent, 30);
  const loaded = await history.list(p);
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.records, [r]);
  r = f.advanceBoardRecord(loaded.records[0], { type: "buy", player: 0 });
  await history.save(p, r);
  r = f.advanceBoardRecord(r, { type: "roll", player: 1 }, "basic");
  await history.save(p, r);
  assert.equal(r.final.outcome.winner, 0);
  assert.equal(r.final.players[0].cash, 35);
  assert.equal(r.model.tiles[1].rent, 30);
  assert.equal(f.newBoardRecord(p.id, p.model).final.players[0].cash, 1000);
  assert.equal(f.boardReplay(r, 1).phase, "purchase");
  assert.equal(f.boardReplay(r, 2).owners.dock, 0);
  assert.deepEqual((await history.list(p)).records, [r]);
  p.model = structuredClone(p.versions[0].model);
  await repo.saveProject(p);
  assert.equal((await repo.reload(p)).model.rules.initialCash, 20);
});

test("board projects coexist with existing types and reject incompatible versions, examples and presets before mutation", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await create(host, repo);
  for (const direction of [
    "card-scoring",
    "resource-development",
    "branching-story",
    "doudizhu",
  ])
    await repo.create({
      name: direction,
      parent: host.projectsPath,
      direction,
    });
  const all = await repo.list();
  assert.deepEqual(all.errors, []);
  assert.deepEqual(all.incompatible, []);
  assert.equal(all.projects.length, 5);
  const before = await readFile(join(p.path, "models/core.json"), "utf8"),
    dirs = await readdir(host.projectsPath);
  await assert.rejects(repo.reset(p, "combination"), /不能应用/);
  await assert.rejects(
    repo.create({
      name: "错误示例",
      parent: host.projectsPath,
      gameType: "board",
      direction: "board-economy",
      exampleId: "combination",
    }),
    /不兼容/,
  );
  await assert.rejects(
    repo.create({
      name: "错误预设",
      parent: host.projectsPath,
      direction: "board-economy",
      presetId: "paired-scoring",
    }),
    /不兼容/,
  );
  assert.deepEqual(await readdir(host.projectsPath), dirs);
  assert.equal(
    await readFile(join(p.path, "models/core.json"), "utf8"),
    before,
  );
  const bad = structuredClone(p);
  bad.versions.push({
    id: "card",
    name: "错误版本",
    createdAt: p.createdAt,
    gameType: "card",
    direction: "card-scoring",
    simulator: f.cardSimulator,
    brief: bad.brief,
    model: f.createFrameworkModel("card-scoring", "卡牌"),
  });
  assert.throws(() => f.projectDocument(bad));
  assert.equal(
    await readFile(join(p.path, "models/core.json"), "utf8"),
    before,
  );
});

test("failed board writes do not spend money, publish a roll or change the next seeded result", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await create(host, repo),
    history = f.createBoardHistory(host.data, host.files);
  const r = f.newBoardRecord(p.id, p.model),
    before = structuredClone(r);
  await history.save(p, r);
  const next = f.advanceBoardRecord(r, { type: "roll", player: 0 });
  const failing = f.createBoardHistory(host.data, {
    ...host.files,
    writeText: async () => {
      throw new Error("disk unavailable");
    },
  });
  await assert.rejects(failing.save(p, next), /disk unavailable/);
  assert.deepEqual(r, before);
  assert.deepEqual((await history.list(p)).records, [r]);
  assert.deepEqual(
    f.advanceBoardRecord(r, { type: "roll", player: 0 }).final,
    next.final,
  );
});

test("board histories protect external edits and preserve tampered snapshots until explicitly removed", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await create(host, repo),
    history = f.createBoardHistory(host.data, host.files);
  let r = f.newBoardRecord(p.id, p.model);
  await history.save(p, r);
  const path = join(p.path, "runs", r.id + ".json"),
    external = JSON.parse(await readFile(path, "utf8"));
  external.updatedAt = "2020-01-01T00:00:00.000Z";
  await writeFile(path, JSON.stringify(external));
  const next = f.advanceBoardRecord(r, { type: "roll", player: 0 });
  await assert.rejects(history.save(p, next), /外部修改/);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), external);
  const fresh = (await history.list(p)).records[0];
  r = f.advanceBoardRecord(fresh, { type: "roll", player: 0 });
  await history.save(p, r);
  const corrupt = JSON.parse(await readFile(path, "utf8"));
  corrupt.final.owners.dock = 1;
  await writeFile(path, JSON.stringify(corrupt));
  const loaded = await history.list(p);
  assert.equal(loaded.records.length, 0);
  assert.equal(loaded.incompatible.length, 1);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), corrupt);
});

test("a valid external change of model type cannot authorize overwriting it through the old board workspace", async (t) => {
  const host = await createProjectHost();
  t.after(() => host.close());
  const repo = f.createProjectRepository(host.data, host.files),
    p = await create(host, repo);
  const replacement = {
    ...structuredClone(p),
    gameType: "card",
    direction: "card-scoring",
    simulator: f.cardSimulator,
    versions: [],
    model: f.createFrameworkModel("card-scoring", "新的卡牌方案"),
  };
  const path = join(p.path, "models/core.json"),
    text = JSON.stringify(f.projectDocument(replacement));
  await writeFile(path, text);
  await assert.rejects(repo.reload(p), /项目类型已变化/);
  p.model.name = "旧棋盘编辑";
  await assert.rejects(repo.saveProject(p), /重新打开/);
  assert.equal(await readFile(path, "utf8"), text);
  const opened = (await repo.list()).projects[0];
  assert.equal(opened.model.format, "gameplay-card-v1");
  assert.equal(f.isBoardProject(opened), false);
});
