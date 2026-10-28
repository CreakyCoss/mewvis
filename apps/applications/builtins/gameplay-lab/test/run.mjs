import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "gameplay-lab-test-"));
const entry = join(temporary, "model.mjs");
await build({
  stdin: {
    contents:
      'export * from "./main/model.ts"; export * from "./main/engine.ts"; export * from "./main/fixtures.ts"; export * from "./main/storage.ts";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: entry,
  logLevel: "silent",
});
const f = await import(pathToFileURL(entry).href);
after(() => rm(temporary, { recursive: true, force: true }));

test("both templates use one validator and engine and can reach their target", () => {
  for (const model of f.templates) {
    assert.deepEqual(f.validateModel(model), []);
    const run = f.simulate(model, 42, "goal");
    assert.equal(f.current(run).outcome.kind, "won");
    assert.ok(run.entries.length > 2);
  }
});
test("editing the draft cannot rewrite a running or historical snapshot", () => {
  const model = f.makeTemplate(),
    run = f.startRun(model);
  model.actions.find((a) => a.id === "study").costs[0].value = 100;
  const next = f.step(run, { action: "study" });
  assert.equal(f.current(next).players[0].values.materials, 32);
  assert.equal(f.current(run).players[0].values.materials, 40);
  assert.equal(run.model.actions[1].costs[0].value, 8);
});
test("aggregate costs and invalid selections are atomic", () => {
  const model = f.makeTemplate();
  model.actions[1].costs = [
    { field: "materials", value: 25 },
    { field: "materials", value: 25 },
  ];
  const run = f.startRun(model),
    original = structuredClone(run);
  assert.throws(() => f.step(run, { action: "study" }), /不足/);
  assert.deepEqual(run, original);
  const combo = f.startRun(f.makeTemplate("combination"));
  const id = f.current(combo).players[0].collections.hand.hand[0].id;
  assert.throws(
    () => f.step(combo, { action: "play", cards: [id, id] }),
    /不同对象/,
  );
  assert.throws(
    () => f.step(combo, { action: "play", cards: ["not-in-hand"] }),
    /不同对象/,
  );
  assert.equal(combo.entries.length, 1);
});
test("combination scoring explains arithmetic and preserves every collection member", () => {
  let run = f.startRun(f.makeTemplate("combination"), 17);
  const originalIds = run.model.collections[0].cards.map((c) => c.id).sort();
  for (let i = 0; i < 3 && !f.current(run).outcome; i++) {
    const choice = f.choose(run, "goal");
    run = f.step(run, choice);
    const pile = f.current(run).players[0].collections.hand;
    assert.deepEqual(
      [...pile.hand, ...pile.draw, ...pile.discard].map((c) => c.id).sort(),
      originalIds,
    );
    assert.match(run.entries.at(-1).notes.join(" "), /基础.*同类奖励.*倍率/);
  }
});
test("seed and recorded actions reproduce state, including replenishment", () => {
  const run = f.simulate(f.makeTemplate("combination"), 77, "growth", 2);
  const restored = f.replay(
    run,
    run.entries.slice(1).map((e) => e.choice),
  );
  assert.deepEqual(restored.entries, run.entries);
});
test("turns rotate, income resolves after all players, and goals check immediately", () => {
  let run = f.startRun(f.makeTemplate(), 42, 2);
  run = f.step(run, { action: "__end_turn" });
  assert.equal(f.current(run).actor, 1);
  assert.equal(f.current(run).round, 1);
  assert.equal(f.current(run).players[0].values.materials, 40);
  run = f.step(run, { action: "__end_turn" });
  assert.equal(f.current(run).round, 2);
  assert.equal(f.current(run).players[0].values.materials, 42);
  const model = f.makeTemplate();
  model.goals[0].threshold = 15;
  const won = f.step(f.startRun(model), { action: "study" });
  assert.equal(f.current(won).outcome.kind, "won");
  assert.equal(f.current(won).round, 1);
});
test("multiple objectives remain open and limits are not reported as draws or victories", () => {
  const model = f.makeTemplate();
  model.goals.push({
    id: "stock-target",
    name: "储备目标",
    description: "另一条达成路径",
    field: "materials",
    threshold: 50,
  });
  const run = f.step(f.startRun(model), { action: "trade" });
  assert.equal(f.current(run).outcome.winners[0].goal, "stock-target");
  const limited = f.makeTemplate();
  limited.flow.maxRounds = 1;
  assert.equal(
    f.current(f.step(f.startRun(limited), { action: "__end_turn" })).outcome
      .kind,
    "limit",
  );
});
test("overflow and malformed effects reject without committing", () => {
  const model = f.makeTemplate();
  model.fields[0].initial = 1_000_000;
  const run = f.startRun(model);
  assert.throws(() => f.step(run, { action: "trade" }), /数值范围/);
  assert.equal(f.current(run).players[0].values.materials, 1_000_000);
  const unknown = f.makeTemplate();
  unknown.actions[0].effects = [{ type: "executeCode", code: "unknown" }];
  assert.ok(f.validateModel(unknown).length);
  const missing = f.makeTemplate();
  missing.actions[1].costs[0].field = "missing";
  assert.throws(() => f.startRun(missing), /引用/);
});
test("unfinished project JSON persists structurally, while malformed data is rejected", () => {
  const project = {
    id: "test-project",
    workspaceId: "test-workspace",
    path: "/test/project",
    templateId: "development",
    createdAt: new Date().toISOString(),
    versions: [],
    model: f.makeTemplate(),
  };
  project.model.fields = [];
  project.model.capabilities = [];
  project.model.actions = [];
  project.model.goals = [];
  project.model.flow.income = [];
  const document = f.projectDocument(project);
  assert.doesNotThrow(() => f.parseProjectDocument(document, project));
  assert.throws(() => f.startRun(project.model), /至少/);
  document.project.versions = [
    { id: "v", name: "bad", createdAt: "now", model: {} },
  ];
  assert.throws(
    () => f.parseProjectDocument(document, project),
    /格式|无法读取/,
  );
  assert.deepEqual(f.initialWorkspace().projects, []);
});
